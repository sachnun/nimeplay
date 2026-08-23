/**
 * Incremental anime scraper.
 *
 * Structure pass (Otakudesu): slugs, titles, episodes only.
 * Metadata pass (MyAnimeList): synopsis, score, poster, genres, characters...
 * Rows without MAL metadata stay hidden from the API until resolved.
 *
 * Usage:
 *   DATABASE_URL=... npm run scrape
 *   SCRAPE_PAGES=3 SCRAPE_COMPLETED_PAGES=1 npm run scrape
 */
import { eq, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '../server/utils/db'
import { anime, animeGenres, episodes, genres } from '../server/database/schema'
import { fetchMalAnime, searchMalAnime } from '../server/utils/mal'
import { scrapeAnimeDetail, scrapeCompleted, scrapeOngoing } from '../server/utils/scraper'

const OTAKUDESU_BASE = 'https://otakudesu.blog'
const ONGOING_PAGES = Number(process.env.SCRAPE_PAGES || 3)
const COMPLETED_PAGES = Number(process.env.SCRAPE_COMPLETED_PAGES || 1)
const METADATA_STALE_DAYS = Number(process.env.SCRAPE_STALE_DAYS || 7)
const SITE_DELAY_MS = Number(process.env.SCRAPE_SITE_DELAY_MS || 700)
const MAL_DELAY_MS = Number(process.env.SCRAPE_MAL_DELAY_MS || 1200)

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function episodeNumber(titleOrSlug: string): number | null {
  const match = titleOrSlug.match(/episode-(\d+)/) ?? titleOrSlug.match(/episode\s+(\d+)/i)
  return match ? Number(match[1]) : null
}

function normalizeStatus(raw: string): string {
  const value = raw.toLowerCase()
  if (value.includes('completed') || value.includes('finished')) return 'COMPLETED'
  return 'ONGOING'
}

async function registerAnimeRow(slug: string, title: string) {
  // List pages only introduce candidates; never bump updatedAt here so the
  // detail pass can pick them up as pending work.
  await db()
    .insert(anime)
    .values({ slug, title, sourceUrl: `${OTAKUDESU_BASE}/anime/${slug}/` })
    .onConflictDoNothing()
}

async function upsertEpisodes(
  animeSlug: string,
  list: { title: string, slug: string, date: string }[],
) {
  const rows = list
    .map(entry => ({ entry, number: episodeNumber(entry.slug) ?? episodeNumber(entry.title) }))
    .filter((row): row is { entry: typeof list[number], number: number } => row.number !== null)

  if (rows.length === 0) return

  // Insert in chunks; on conflict update nothing (episodes are immutable).
  const chunkSize = 100
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map(({ entry, number }) => ({
      animeSlug,
      slug: entry.slug,
      number,
      title: entry.title,
      releaseDate: entry.date || null,
    }))
    await db().insert(episodes).values(chunk).onConflictDoNothing()
  }
}



async function structurePass() {
  console.log(`[structure] ongoing pages 1..${ONGOING_PAGES}, completed pages 1..${COMPLETED_PAGES}`)

  for (let page = 1; page <= ONGOING_PAGES; page++) {
    const { anime: cards } = await scrapeOngoing(page)
    for (const card of cards) {
      await registerAnimeRow(card.slug, card.title)
    }
  }

  for (let page = 1; page <= COMPLETED_PAGES; page++) {
    const { anime: cards } = await scrapeCompleted(page)
    for (const card of cards) {
      await registerAnimeRow(card.slug, card.title)
    }
  }

  // Only scrape details for new or stale anime — the core of the incremental sync.
  const staleCutoff = new Date(Date.now() - METADATA_STALE_DAYS * 24 * 60 * 60 * 1000)
  const candidates = await db()
    .select({ slug: anime.slug, title: anime.title })
    .from(anime)
    .where(sql`(
      ${anime.updatedAt} < ${staleCutoff.toISOString()}
      or not exists (select 1 from episodes e where e.anime_slug = ${anime.slug})
    )`)

  console.log(`[structure] ${candidates.length} anime need detail sync`)

  let done = 0
  for (const { slug, title } of candidates) {
    try {
      const detail = await scrapeAnimeDetail(slug)
      if (!detail) continue
      await db()
        .update(anime)
        .set({ title: detail.title || title, status: normalizeStatus(detail.status), updatedAt: new Date() })
        .where(eq(anime.slug, slug))
      await upsertEpisodes(slug, detail.episodes)
    }
    catch (error) {
      console.warn(`[structure] failed ${slug}:`, error instanceof Error ? error.message : error)
    }
    finally {
      done++
      if (done % 10 === 0) console.log(`[structure] ${done}/${candidates.length}`)
      await sleep(SITE_DELAY_MS)
    }
  }
  console.log(`[structure] done (${done} anime)`)
}

/** Replace an anime's genre links with the given canonical genre names. */
async function syncGenres(animeSlug: string, names: string[]) {
  if (names.length === 0) return

  const rows = names.map(name => ({
    slug: slugify(name),
    name,
  }))

  await db().insert(genres).values(rows).onConflictDoNothing()
  const stored = await db().select({ id: genres.id, slug: genres.slug }).from(genres)
  const bySlug = new Map(stored.map(genre => [genre.slug, genre.id]))

  const links = rows
    .map(row => bySlug.get(row.slug))
    .filter((id): id is number => id !== undefined)
    .map(id => ({ animeSlug, genreId: id }))

  await db().delete(animeGenres).where(eq(animeGenres.animeSlug, animeSlug))
  if (links.length > 0) await db().insert(animeGenres).values(links).onConflictDoNothing()
}

/**
 * Guard against false MAL search matches: require at least one significant
 * shared word between the streaming-site title and the canonical MAL title.
 */
const TITLE_STOPWORDS = new Set(['the', 'and', 'for', 'season', 'part', 'episode', 'movie', 'special', 'ova', 'end'])

function titlesMatch(siteTitle: string, malTitle: string): boolean {
  const words = (value: string) => new Set(
    value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(word => word.length >= 3 && !TITLE_STOPWORDS.has(word)),
  )
  const siteWords = words(siteTitle)
  const malWords = words(malTitle)
  for (const word of siteWords) {
    if (malWords.has(word)) return true
  }
  return siteWords.size === 0 // no usable words -> accept the match
}

async function metadataPass() {
  const staleCutoff = new Date(Date.now() - METADATA_STALE_DAYS * 24 * 60 * 60 * 1000)

  // Staleness is tracked separately from `updated_at` (which the structure
  // pass bumps on every content refresh).
  const pending = await db()
    .select({ slug: anime.slug, title: anime.title })
    .from(anime)
    .where(or(isNull(anime.malId), isNull(anime.metadataSyncedAt), lt(anime.metadataSyncedAt, staleCutoff)))

  console.log(`[metadata] ${pending.length} anime need MAL metadata`)

  let resolved = 0
  for (const { slug, title } of pending) {
    try {
      const malId = await searchMalAnime(title)
      if (!malId) continue
      await sleep(MAL_DELAY_MS)

      const mal = await fetchMalAnime(malId)
      if (!mal) continue

      if (!titlesMatch(title, mal.title)) {
        console.warn(`[metadata] rejected MAL match for "${title}" -> "${mal.title}" (id ${malId})`)
        continue
      }

      try {
        await db()
          .update(anime)
          .set({
            malId: mal.malId,
            synopsis: mal.synopsis,
            poster: mal.poster,
            rating: mal.score !== null ? String(mal.score) : null,
            rank: mal.rank,
            popularity: mal.popularity,
            season: mal.season && mal.year ? `${mal.season} ${mal.year}` : mal.season,
            trailerId: mal.trailerId,
            characters: mal.characters,
            metadataSyncedAt: new Date(),
          })
          .where(eq(anime.slug, slug))
        await syncGenres(slug, mal.genres)
      }
      catch (error) {
        // Unique violation on mal_id: another slug already claimed it.
        // The Neon driver nests the Postgres error in `cause`.
        const pgCode = (error as { code?: string }).code
          ?? (error as { cause?: { code?: string } }).cause?.code
        if (pgCode === '23505') {
          console.warn(`[metadata] mal_id ${mal.malId} already owned by another row, skipping ${slug}`)
          continue
        }
        throw error
      }
      resolved++

      if (resolved % 10 === 0) console.log(`[metadata] ${resolved}/${pending.length}`)
      await sleep(MAL_DELAY_MS)
    }
    catch (error) {
      console.warn(`[metadata] failed ${slug}:`, error instanceof Error ? error.message : error)
    }
  }
  console.log(`[metadata] resolved ${resolved}/${pending.length}`)
}

async function main() {
  const started = Date.now()
  await structurePass()
  await metadataPass()
  console.log(`[scrape] finished in ${Math.round((Date.now() - started) / 1000)}s`)
}

main().catch((error) => {
  console.error('[scrape] fatal:', error)
  process.exit(1)
})

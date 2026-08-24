/**
 * Incremental anime scraper.
 *
 * Structure pass (Otakudesu): slugs, titles, episodes only.
 * Metadata pass (MyAnimeList): synopsis, score, poster, genres, characters...
 * Rows without MAL metadata stay hidden from the API until resolved.
 *
 * Usage:
 *   DATABASE_URL=... npm run scrape
 *   SCRAPE_MODE=full SCRAPE_PAGES=3 npm run scrape
 *
 * Modes:
 *   cron (default) — discover new anime, update episodes, resolve rows that
 *                    have no MAL metadata yet. Cheap; meant for the scheduled job.
 *   full           — additionally refresh MAL metadata older than
 *                    SCRAPE_STALE_DAYS (default 7).
 *
 * Tunables: SCRAPE_CONCURRENCY (default 4), SCRAPE_SITE_DELAY_MS (400),
 * SCRAPE_MAL_DELAY_MS (600), SCRAPE_PAGES (3), SCRAPE_COMPLETED_PAGES (1).
 */
import { eq, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '../server/utils/db'
import { anime, animeGenres, episodes, genres } from '../server/database/schema'
import { bestMalAnimeMatch, fetchMalAnime, searchMalAnimeEntries } from '../server/utils/mal'
import { scrapeAnimeDetail, scrapeCompleted, scrapeOngoing, parseEpisodeDate } from '../server/utils/scraper'

const OTAKUDESU_BASE = 'https://otakudesu.blog'
const ONGOING_PAGES = Number(process.env.SCRAPE_PAGES || 3)
const COMPLETED_PAGES = Number(process.env.SCRAPE_COMPLETED_PAGES || 1)
const METADATA_STALE_DAYS = Number(process.env.SCRAPE_STALE_DAYS || 7)
const SITE_DELAY_MS = Number(process.env.SCRAPE_SITE_DELAY_MS || 400)
const MAL_DELAY_MS = Number(process.env.SCRAPE_MAL_DELAY_MS || 600)
const CONCURRENCY = Number(process.env.SCRAPE_CONCURRENCY || 4)

const MODE = process.env.SCRAPE_MODE === 'full' ? 'full' : 'cron'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Run `worker` over every item with at most CONCURRENCY parallel workers. */
async function pool<T>(items: T[], worker: (item: T) => Promise<void>) {
  let index = 0
  const runners = Array.from({ length: Math.max(1, Math.min(CONCURRENCY, items.length)) }, async () => {
    while (index < items.length) {
      const item = items[index++]!
      await worker(item)
      if (index < items.length) await sleep(SITE_DELAY_MS)
    }
  })
  await Promise.all(runners)
}

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

const VALID_DAYS = new Set(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'])

async function registerAnimeRow(slug: string, title: string, day?: string, date?: string) {
  // List pages only introduce candidates; never bump updatedAt here so the
  // detail pass can pick them up as pending work. Airing day is refreshed
  // on every run for ongoing anime, and the list-page card carries the
  // newest episode's upload date, keeping the home-list ordering fresh
  // between detail syncs.
  const airingDay = day && VALID_DAYS.has(day) ? day : null
  const latestEpisodeAt = date ? parseEpisodeDate(date) : null
  await db()
    .insert(anime)
    .values({ slug, title, day: airingDay, latestEpisodeAt, sourceUrl: `${OTAKUDESU_BASE}/anime/${slug}/` })
    .onConflictDoUpdate({
      target: anime.slug,
      set: {
        day: airingDay,
        ...(latestEpisodeAt ? { latestEpisodeAt } : {}),
      },
    })
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

interface Candidate {
  slug: string
  title: string
}

async function structurePass() {
  console.log(`[structure] ongoing pages 1..${ONGOING_PAGES}, completed pages 1..${COMPLETED_PAGES}`)

  const cards: { slug: string, title: string, day?: string, date?: string }[] = []
  for (let page = 1; page <= ONGOING_PAGES; page++) {
    const result = await scrapeOngoing(page)
    cards.push(...result.anime.map(card => ({ slug: card.slug, title: card.title, day: card.day, date: card.date })))
  }
  for (let page = 1; page <= COMPLETED_PAGES; page++) {
    const result = await scrapeCompleted(page)
    cards.push(...result.anime.map(card => ({ slug: card.slug, title: card.title, day: card.day, date: card.date })))
  }

  const seen = new Set<string>()
  const unique = cards.filter(card => !seen.has(card.slug) && seen.add(card.slug))
  await pool(unique, card => registerAnimeRow(card.slug, card.title, card.day, card.date))

  // Only scrape details for new or stale anime — the core of the incremental sync.
  const staleCutoff = new Date(Date.now() - METADATA_STALE_DAYS * 24 * 60 * 60 * 1000)
  const candidates: Candidate[] = await db()
    .select({ slug: anime.slug, title: anime.title })
    .from(anime)
    .where(sql`(
      ${anime.updatedAt} < ${staleCutoff.toISOString()}
      or not exists (select 1 from episodes e where e.anime_slug = ${anime.slug})
    )`)

  console.log(`[structure] ${candidates.length} anime need detail sync`)

  let done = 0
  await pool(candidates, async ({ slug, title }) => {
    try {
      const detail = await scrapeAnimeDetail(slug)
      if (!detail) return
      const status = normalizeStatus(detail.status)
      const latestEpisodeAt = detail.episodes
        .map(entry => parseEpisodeDate(entry.date))
        .filter((date): date is Date => date !== null)
        .reduce<Date | null>((latest, date) => (!latest || date > latest ? date : latest), null)
      await db()
        .update(anime)
        .set({
          title: detail.title || title,
          status,
          // A completed anime no longer has an airing day.
          ...(status === 'COMPLETED' ? { day: null } : {}),
          // Only overwrite when a date is known, so a transient empty
          // episode list can't wipe the stored value.
          ...(latestEpisodeAt ? { latestEpisodeAt } : {}),
          updatedAt: new Date(),
        })
        .where(eq(anime.slug, slug))
      await upsertEpisodes(slug, detail.episodes)
    }
    catch (error) {
      console.warn(`[structure] failed ${slug}:`, error instanceof Error ? error.message : error)
    }
    finally {
      done++
      if (done % 25 === 0) console.log(`[structure] ${done}/${candidates.length}`)
    }
  })
  console.log(`[structure] done (${done}/${candidates.length} anime)`)
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

async function resolveMetadata(slug: string, title: string): Promise<boolean> {
  try {
    // Match against display titles straight from the search results, so only
    // ONE detail fetch per anime is needed. Score all candidates instead of
    // taking the first loose match — MAL lists movies/spinoffs before the
    // series itself (e.g. "One Piece Film: Z" before "One Piece").
    const entries = await searchMalAnimeEntries(title)
    const entry = bestMalAnimeMatch(title, entries)
    if (!entry) {
      console.warn(`[metadata] no MAL title matches "${title}" (top: "${entries[0]?.title ?? '-'}")`)
      return false
    }

    const mal = await fetchMalAnime(entry.id)
    if (!mal) return false

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
          studio: mal.studio,
          source: mal.source,
          characters: mal.characters,
          metadataSyncedAt: new Date(),
        })
        .where(eq(anime.slug, slug))
      await syncGenres(slug, mal.genres)
      return true
    }
    catch (error) {
      // Unique violation on mal_id: another slug already claimed it.
      // The Neon driver nests the Postgres error in `cause`.
      const pgCode = (error as { code?: string }).code
        ?? (error as { cause?: { code?: string } }).cause?.code
      if (pgCode === '23505') {
        console.warn(`[metadata] mal_id ${mal.malId} already owned by another row, skipping ${slug}`)
        return false
      }
      throw error
    }
  }
  catch (error) {
    console.warn(`[metadata] failed ${slug}:`, error instanceof Error ? error.message : error)
    return false
  }
}

async function metadataPass() {
  // Staleness is tracked separately from `updated_at` (which the structure
  // pass bumps on every content refresh). In `cron` mode only fully
  // unresolved rows are retried — periodic MAL re-refresh requires a manual
  // `SCRAPE_MODE=full` run.
  const staleCutoff = new Date(Date.now() - METADATA_STALE_DAYS * 24 * 60 * 60 * 1000)

  const pending: Candidate[] = await db()
    .select({ slug: anime.slug, title: anime.title })
    .from(anime)
    .where(MODE === 'cron'
      ? or(isNull(anime.malId), isNull(anime.metadataSyncedAt))
      : or(isNull(anime.malId), lt(anime.metadataSyncedAt, staleCutoff)))

  console.log(`[metadata] ${pending.length} anime need MAL metadata (${MODE})`)

  let resolved = 0
  let failed = 0
  await pool(pending, async ({ slug, title }) => {
    try {
      if (await resolveMetadata(slug, title)) {
        resolved++
        if (resolved % 10 === 0) console.log(`[metadata] ${resolved}/${pending.length}`)
      }
    }
    catch (error) {
      // Search unavailable (throttled): keep the row pending for the next run.
      failed++
      console.warn(`[metadata] deferred ${slug}:`, error instanceof Error ? error.message : error)
      await sleep(5000)
    }
    // Pacing is global: scale per-worker delay by concurrency so MAL sees
    // roughly one request every MAL_DELAY_MS across all workers.
    await sleep(MAL_DELAY_MS * CONCURRENCY)
  })
  console.log(`[metadata] resolved ${resolved}/${pending.length}${failed ? `, deferred ${failed}` : ''}`)
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

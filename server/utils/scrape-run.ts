import { eq, isNull, lt, or, sql } from 'drizzle-orm'
import { anime, animeGenres, episodes, genres } from '../database/schema'
import { db } from './db'
import { bestMalAnimeMatch, fetchMalAnime, searchMalAnimeEntries } from './mal'
import { parseEpisodeDate, scrapeAnimeDetailFresh, scrapeCompletedFresh, scrapeOngoingFresh } from './scraper'

const OTAKUDESU_BASE = 'https://otakudesu.blog'
const ONGOING_PAGES = Number(process.env.SCRAPE_PAGES || 3)
const COMPLETED_PAGES = Number(process.env.SCRAPE_COMPLETED_PAGES || 1)
const METADATA_STALE_DAYS = Number(process.env.SCRAPE_STALE_DAYS || 7)
const SITE_DELAY_MS = Number(process.env.SCRAPE_SITE_DELAY_MS || 400)
const MAL_DELAY_MS = Number(process.env.SCRAPE_MAL_DELAY_MS || 600)
const CONCURRENCY = Number(process.env.SCRAPE_CONCURRENCY || 4)
const DETAIL_BUDGET = Number(process.env.SCRAPE_DETAIL_BUDGET || 6)
const META_BUDGET = Number(process.env.SCRAPE_META_BUDGET || 3)
const WALL_BUDGET_MS = Number(process.env.SCRAPE_WALL_BUDGET_MS || 15000)

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function pool<T>(items: T[], worker: (item: T) => Promise<void>, deadlineMs: number) {
  let index = 0
  const runners = Array.from({ length: Math.max(1, Math.min(CONCURRENCY, items.length)) }, async () => {
    while (index < items.length) {
      if (Date.now() > deadlineMs) break
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

async function registerAnimeRows(cards: { slug: string, title: string, day?: string, date?: string }[]) {
  const rows = cards.map(card => ({
    slug: card.slug,
    title: card.title,
    day: card.day && VALID_DAYS.has(card.day) ? card.day : null,
    latestEpisodeAt: card.date ? parseEpisodeDate(card.date) : null,
    sourceUrl: `${OTAKUDESU_BASE}/anime/${card.slug}/`,
  }))
  const chunkSize = 100
  for (let i = 0; i < rows.length; i += chunkSize) {
    await db()
      .insert(anime)
      .values(rows.slice(i, i + chunkSize))
      .onConflictDoUpdate({
        target: anime.slug,
        set: {
          day: sql`excluded.day`,
          latestEpisodeAt: sql`coalesce(excluded.latest_episode_at, ${anime.latestEpisodeAt})`,
        },
      })
  }
}

async function upsertEpisodes(
  animeSlug: string,
  list: { title: string, slug: string, date: string }[],
) {
  const rows = list
    .map(entry => ({ entry, number: episodeNumber(entry.slug) ?? episodeNumber(entry.title) }))
    .filter((row): row is { entry: typeof list[number], number: number } => row.number !== null)

  if (rows.length === 0) return

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

async function countPendingStructure(): Promise<number> {
  const staleCutoff = new Date(Date.now() - METADATA_STALE_DAYS * 24 * 60 * 60 * 1000)
  const rows = await db()
    .select({
      slug: anime.slug,
      updatedAt: anime.updatedAt,
      episodeCount: sql<number>`(select count(*) from episodes e where e.anime_slug = ${anime.slug})`,
    })
    .from(anime)
    .where(sql`(
      ${anime.updatedAt} < ${staleCutoff.toISOString()}
      or not exists (select 1 from episodes e where e.anime_slug = ${anime.slug})
    )`)
    .limit(8)
  console.warn('[structure] pending rows:', JSON.stringify(rows))
  return rows.length
}

async function countPendingMetadata(mode: 'cron' | 'full'): Promise<number> {
  const staleCutoff = new Date(Date.now() - METADATA_STALE_DAYS * 24 * 60 * 60 * 1000)
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(anime)
    .where(mode === 'cron'
      ? or(isNull(anime.malId), isNull(anime.metadataSyncedAt))
      : or(isNull(anime.malId), lt(anime.metadataSyncedAt, staleCutoff)))
  return row?.count ?? 0
}

async function structurePass() {
  console.log(`[structure] ongoing pages 1..${ONGOING_PAGES}, completed pages 1..${COMPLETED_PAGES}`)
  const startedAt = Date.now()

  const cards: { slug: string, title: string, day?: string, date?: string }[] = []
  for (let page = 1; page <= ONGOING_PAGES; page++) {
    const result = await scrapeOngoingFresh(page)
    cards.push(...result.anime.map(card => ({ slug: card.slug, title: card.title, day: card.day, date: card.date })))
  }
  for (let page = 1; page <= COMPLETED_PAGES; page++) {
    const result = await scrapeCompletedFresh(page)
    cards.push(...result.anime.map(card => ({ slug: card.slug, title: card.title, day: card.day, date: card.date })))
  }

  const seen = new Set<string>()
  const unique = cards.filter(card => !seen.has(card.slug) && seen.add(card.slug))
  await registerAnimeRows(unique)

  const staleCutoff = new Date(Date.now() - METADATA_STALE_DAYS * 24 * 60 * 60 * 1000)
  const candidates: Candidate[] = await db()
    .select({ slug: anime.slug, title: anime.title })
    .from(anime)
    .where(sql`(
      ${anime.updatedAt} < ${staleCutoff.toISOString()}
      or not exists (select 1 from episodes e where e.anime_slug = ${anime.slug})
    )`)

  const targets = candidates.slice(0, DETAIL_BUDGET)
  console.log(`[structure] ${candidates.length} anime need detail sync, processing ${targets.length}`)

  let done = 0
  await pool(targets, async ({ slug, title }) => {
    try {
      const detail = await scrapeAnimeDetailFresh(slug)
      if (!detail) {
        console.warn(`[structure] empty detail ${slug}`)
        return
      }
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
          ...(status === 'COMPLETED' ? { day: null } : {}),
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
      if (done % 25 === 0) console.log(`[structure] ${done}/${targets.length}`)
    }
  }, startedAt + WALL_BUDGET_MS)
  const totalRemaining = await countPendingStructure()
  console.log(`[structure] done (${done}/${targets.length} anime)`)
  return { candidates: candidates.length, done, remaining: totalRemaining }
}

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

async function metadataPass(mode: 'cron' | 'full') {
  const staleCutoff = new Date(Date.now() - METADATA_STALE_DAYS * 24 * 60 * 60 * 1000)
  const startedAt = Date.now()

  const pending: Candidate[] = await db()
    .select({ slug: anime.slug, title: anime.title })
    .from(anime)
    .where(mode === 'cron'
      ? or(isNull(anime.malId), isNull(anime.metadataSyncedAt))
      : or(isNull(anime.malId), lt(anime.metadataSyncedAt, staleCutoff)))
    .orderBy(sql`random()`)

  const targets = pending.slice(0, META_BUDGET)
  console.log(`[metadata] ${pending.length} anime need MAL metadata (${mode}), processing ${targets.length}`)

  let resolved = 0
  let failed = 0
  await pool(targets, async ({ slug, title }) => {
    try {
      if (await resolveMetadata(slug, title)) {
        resolved++
        if (resolved % 10 === 0) console.log(`[metadata] ${resolved}/${targets.length}`)
      }
    }
    catch (error) {
      failed++
      console.warn(`[metadata] deferred ${slug}:`, error instanceof Error ? error.message : error)
      await sleep(5000)
    }
    await sleep(MAL_DELAY_MS * CONCURRENCY)
  }, startedAt + WALL_BUDGET_MS)
  const totalRemaining = await countPendingMetadata(mode)
  console.log(`[metadata] resolved ${resolved}/${targets.length}${failed ? `, deferred ${failed}` : ''}`)
  return { pending: pending.length, resolved, deferred: failed, remaining: totalRemaining }
}

export interface ScrapeStats {
  mode: 'cron' | 'full'
  startedAt: string
  finishedAt: string
  durationMs: number
  completed: boolean
  structure: { candidates: number, done: number, remaining: number }
  metadata: { pending: number, resolved: number, deferred: number, remaining: number }
}

export async function runScrape(options: { mode?: 'cron' | 'full' } = {}): Promise<ScrapeStats> {
  const mode = options.mode === 'full' ? 'full' : 'cron'
  const startedAt = new Date()
  const structure = await structurePass()
  const metadata = await metadataPass(mode)
  return {
    mode,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    completed: structure.remaining === 0 && metadata.remaining === 0,
    structure,
    metadata,
  }
}
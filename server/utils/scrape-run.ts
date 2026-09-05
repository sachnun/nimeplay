import { eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { anime, animeGenres, episodes, genres } from '../database/schema'
import { db } from './db'
import { bestMalAnimeMatch, fetchMalAnime, searchMalAnimeEntries } from './mal'
import { mirrorAnimeMedia } from './media-mirror'
import { toR2Url } from './r2'
import { getSources, scrapeAnimeDetailFresh } from './sources'
import { parseEpisodeDate } from './sources/shared'
import type { AnimeSource } from './sources/types'

const ONGOING_PAGES = Number(process.env.SCRAPE_PAGES || 3)
const COMPLETED_PAGES = Number(process.env.SCRAPE_COMPLETED_PAGES || 1)
const METADATA_STALE_DAYS = Number(process.env.SCRAPE_STALE_DAYS || 7)
const SITE_DELAY_MS = Number(process.env.SCRAPE_SITE_DELAY_MS || 400)
const MAL_DELAY_MS = Number(process.env.SCRAPE_MAL_DELAY_MS || 600)
const CONCURRENCY = Number(process.env.SCRAPE_CONCURRENCY || 4)
const DETAIL_BUDGET = Number(process.env.SCRAPE_DETAIL_BUDGET || 6)
const META_BUDGET = Number(process.env.SCRAPE_META_BUDGET || 3)
const WALL_BUDGET_MS = Number(process.env.SCRAPE_WALL_BUDGET_MS || 15000)
const DETAIL_GRACE_MS = Number(process.env.SCRAPE_DETAIL_GRACE_MS || 6 * 60 * 60 * 1000)
const ACTIVE_REFRESH_MS = Number(process.env.SCRAPE_ACTIVE_REFRESH_HOURS || 24) * 60 * 60 * 1000

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

interface RegisterCard {
  source: AnimeSource
  slug: string
  title: string
  day?: string
  date?: string
  ongoingRank?: number | null
}

async function registerAnimeRows(cards: RegisterCard[]) {
  const rows = cards.map(card => ({
    slug: `${card.source.id}:${card.slug}`,
    title: card.title,
    day: card.day && VALID_DAYS.has(card.day) ? card.day : null,
    latestEpisodeAt: card.date ? parseEpisodeDate(card.date) : null,
    ongoingRank: card.ongoingRank ?? null,
    sourceUrl: `${card.source.baseUrl}/anime/${card.slug}/`,
  }))
  const chunkSize = 15
  for (let i = 0; i < rows.length; i += chunkSize) {
    await db()
      .insert(anime)
      .values(rows.slice(i, i + chunkSize))
      .onConflictDoUpdate({
        target: anime.slug,
        set: {
          day: sql`excluded.day`,
          latestEpisodeAt: sql`coalesce(excluded.latest_episode_at, latest_episode_at)`,
          ongoingRank: sql`coalesce(excluded.ongoing_rank, ${anime.ongoingRank})`,
        },
      })
  }
}

async function upsertEpisodes(
  animeSlug: string,
  list: { title: string, slug: string, date: string }[],
) {
  const sourcePrefix = `${animeSlug.split(':')[0]}:`
  const rows = list
    .map(entry => ({ entry, number: episodeNumber(entry.slug) ?? episodeNumber(entry.title) }))
    .filter((row): row is { entry: typeof list[number], number: number } => row.number !== null)

  if (rows.length === 0) return

  const chunkSize = 15
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map(({ entry, number }) => ({
      animeSlug,
      slug: `${sourcePrefix}${entry.slug}`,
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

function pendingStructureWhere(staleCutoffMs: number, detailGraceMs: number, activeRefreshMs: number) {
  return sql`(
    (
      (${anime.status} is null or ${anime.status} = 'ONGOING')
      and ${anime.updatedAt} < ${activeRefreshMs}
    )
    or (
      ${anime.status} = 'COMPLETED'
      and ${anime.updatedAt} < ${staleCutoffMs}
    )
    or (
      not exists (select 1 from episodes e where e.anime_slug = ${anime.slug})
      and ${anime.updatedAt} < ${detailGraceMs}
    )
  )`
}

async function countPendingStructure(): Promise<number> {
  const staleCutoff = new Date(Date.now() - METADATA_STALE_DAYS * 24 * 60 * 60 * 1000)
  const detailGrace = new Date(Date.now() - DETAIL_GRACE_MS)
  const activeRefresh = new Date(Date.now() - ACTIVE_REFRESH_MS)
  const [row] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(anime)
    .where(pendingStructureWhere(staleCutoff.getTime(), detailGrace.getTime(), activeRefresh.getTime()))
  return row?.count ?? 0
}

async function countPendingMetadata(mode: 'cron' | 'full'): Promise<number> {
  const staleCutoff = new Date(Date.now() - METADATA_STALE_DAYS * 24 * 60 * 60 * 1000)
  const [row] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(anime)
    .where(mode === 'cron'
      ? or(isNull(anime.malId), isNull(anime.metadataSyncedAt))
      : or(isNull(anime.malId), lt(anime.metadataSyncedAt, staleCutoff)))
  return row?.count ?? 0
}

export async function refreshAnimeBySlug(slug: string, title: string, refreshMetadata: boolean): Promise<void> {
  try {
    const detail = await scrapeAnimeDetailFresh(slug)
    if (detail) {
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
          ...(status === 'COMPLETED' ? { day: null, ongoingRank: null } : {}),
          ...(latestEpisodeAt ? { latestEpisodeAt } : {}),
          updatedAt: new Date(),
        })
        .where(eq(anime.slug, slug))
      await upsertEpisodes(slug, detail.episodes)
    }
  }
  catch (error) {
    console.warn(`[refresh] detail failed ${slug}:`, error instanceof Error ? error.message : error)
  }
  if (refreshMetadata) {
    try {
      await resolveMetadata(slug, title)
    }
    catch (error) {
      console.warn(`[refresh] metadata failed ${slug}:`, error instanceof Error ? error.message : error)
    }
  }
}

async function structurePass() {
  console.log(`[structure] ongoing pages 1..${ONGOING_PAGES}, completed pages 1..${COMPLETED_PAGES}`)
  const startedAt = Date.now()

  const cards: { source: AnimeSource, slug: string, title: string, day?: string, date?: string, ongoingRank?: number | null, episodeNumber?: number | null }[] = []
  let ongoingRank = 0
  for (const source of getSources()) {
    for (let page = 1; page <= ONGOING_PAGES; page++) {
      const result = await source.ongoingFresh(page)
      for (const card of result.anime) {
        ongoingRank++
        cards.push({ source, slug: card.slug, title: card.title, day: card.day, date: card.date, ongoingRank, episodeNumber: episodeNumber(card.episode) })
      }
    }
    for (let page = 1; page <= COMPLETED_PAGES; page++) {
      const result = await source.completedFresh(page)
      cards.push(...result.anime.map(card => ({ source, slug: card.slug, title: card.title, day: card.day, date: card.date, ongoingRank: null, episodeNumber: null })))
    }
  }

  const seen = new Set<string>()
  const unique = cards.filter(card => !seen.has(`${card.source.id}:${card.slug}`) && seen.add(`${card.source.id}:${card.slug}`))
  await registerAnimeRows(unique)

  const ongoingSlugs = unique.filter(card => card.episodeNumber != null).map(card => `${card.source.id}:${card.slug}`)
  const freshSet = new Set<string>()
  if (ongoingSlugs.length > 0) {
    const episodeRows = await db()
      .select({ slug: episodes.animeSlug, max: sql<number>`max(${episodes.number})` })
      .from(episodes)
      .where(inArray(episodes.animeSlug, ongoingSlugs))
      .groupBy(episodes.animeSlug)
    const dbMax = new Map(episodeRows.map(row => [row.slug, row.max]))
    for (const card of unique) {
      const prefixed = `${card.source.id}:${card.slug}`
      if (card.episodeNumber != null && card.episodeNumber > (dbMax.get(prefixed) ?? 0)) {
        freshSet.add(prefixed)
      }
    }
  }

  const staleCutoff = new Date(Date.now() - METADATA_STALE_DAYS * 24 * 60 * 60 * 1000)
  const detailGrace = new Date(Date.now() - DETAIL_GRACE_MS)
  const activeRefresh = new Date(Date.now() - ACTIVE_REFRESH_MS)
  const candidates: Candidate[] = await db()
    .select({ slug: anime.slug, title: anime.title })
    .from(anime)
    .where(pendingStructureWhere(staleCutoff.getTime(), detailGrace.getTime(), activeRefresh.getTime()))

  const targetSet = new Set<string>()
  const targets: Candidate[] = []
  for (const card of unique) {
    const prefixed = `${card.source.id}:${card.slug}`
    if (freshSet.has(prefixed) && !targetSet.has(prefixed)) {
      targets.push({ slug: prefixed, title: card.title })
      targetSet.add(prefixed)
    }
  }
  for (const candidate of candidates) {
    if (targets.length >= DETAIL_BUDGET) break
    if (!targetSet.has(candidate.slug)) {
      targets.push(candidate)
      targetSet.add(candidate.slug)
    }
  }
  console.log(`[structure] ${candidates.length + freshSet.size} anime need detail sync (${freshSet.size} with new episodes), processing ${targets.length}`)

  let done = 0
  await pool(targets, async ({ slug, title }) => {
    await refreshAnimeBySlug(slug, title, false)
    done++
    if (done % 25 === 0) console.log(`[structure] ${done}/${targets.length}`)
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

  const genreChunkSize = 30
  for (let i = 0; i < rows.length; i += genreChunkSize) {
    await db().insert(genres).values(rows.slice(i, i + genreChunkSize)).onConflictDoNothing()
  }
  const stored = await db().select({ id: genres.id, slug: genres.slug }).from(genres)
  const bySlug = new Map(stored.map(genre => [genre.slug, genre.id]))

  const links = rows
    .map(row => bySlug.get(row.slug))
    .filter((id): id is number => id !== undefined)
    .map(id => ({ animeSlug, genreId: id }))

  await db().delete(animeGenres).where(eq(animeGenres.animeSlug, animeSlug))
  const linkChunkSize = 30
  for (let i = 0; i < links.length; i += linkChunkSize) {
    await db().insert(animeGenres).values(links.slice(i, i + linkChunkSize)).onConflictDoNothing()
  }
}

export async function resolveMetadata(slug: string, title: string): Promise<boolean> {
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
      const poster = mal.poster ? toR2Url(mal.poster, 'posters') : null
      const characters = mal.characters.map(c => ({
        ...c,
        imageUrl: toR2Url(c.imageUrl, 'characters'),
        voiceActor: c.voiceActor ? {
          ...c.voiceActor,
          imageUrl: toR2Url(c.voiceActor.imageUrl, 'voiceactors'),
        } : undefined,
      }))

      await db()
        .update(anime)
        .set({
          malId: mal.malId,
          synopsis: mal.synopsis,
          poster,
          rating: mal.score,
          rank: mal.rank,
          popularity: mal.popularity,
          season: mal.season && mal.year ? `${mal.season} ${mal.year}` : mal.season,
          trailerId: mal.trailerId,
          studio: mal.studio,
          source: mal.source,
          characters,
          metadataSyncedAt: new Date(),
        })
        .where(eq(anime.slug, slug))
      await syncGenres(slug, mal.genres)
      await mirrorAnimeMedia(poster, characters)
      return true
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('UNIQUE constraint failed')) {
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
  skipped?: boolean
  structure: { candidates: number, done: number, remaining: number }
  metadata: { pending: number, resolved: number, deferred: number, remaining: number }
}

let activeRun = false

export async function runScrape(options: { mode?: 'cron' | 'full' } = {}): Promise<ScrapeStats> {
  const mode = options.mode === 'full' ? 'full' : 'cron'
  if (activeRun) {
    console.warn('[scrape] skipped: another run is in progress')
    return {
      mode,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      completed: false,
      skipped: true,
      structure: { candidates: 0, done: 0, remaining: 0 },
      metadata: { pending: 0, resolved: 0, deferred: 0, remaining: 0 },
    }
  }
  activeRun = true
  try {
    const startedAt = new Date()
    let structure = { candidates: 0, done: 0, remaining: 0 }
    let metadata = { pending: 0, resolved: 0, deferred: 0, remaining: 0 }
    try {
      structure = await structurePass()
    }
    catch (error) {
      console.error(`[scrape] structure pass failed:`, error instanceof Error ? error.message : error)
    }
    try {
      metadata = await metadataPass(mode)
    }
    catch (error) {
      console.error(`[scrape] metadata pass failed:`, error instanceof Error ? error.message : error)
    }
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
  finally {
    activeRun = false
  }
}
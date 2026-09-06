import type { H3Event } from 'h3'
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { anime, animeGenres, episodes, genres } from '../database/schema'
import { db } from './db'
import { fetchMalAnime, rankMalAnimeMatches, searchMalAnimeEntries, seasonNumber } from './mal'
import { mirrorAnimeMedia } from './media-mirror'
import { toR2Url } from './r2'
import { getSources, scrapeAnimeDetailFresh, splitSource } from './sources'
import type { AnimeSource } from './sources/types'
import { parseEpisodeDate } from './sources/shared'

const DETAIL_REFRESH_MS = Number(process.env.REFRESH_DETAIL_MS || 6 * 60 * 60 * 1000)
const METADATA_REFRESH_MS = Number(process.env.REFRESH_METADATA_MS || 7 * 24 * 60 * 60 * 1000)
const CATALOG_SYNC_MS = Number(process.env.REFRESH_CATALOG_MS || 10 * 60 * 1000)
const CATALOG_META_BUDGET = Number(process.env.REFRESH_CATALOG_META || 10)
const ONGOING_PAGES = Number(process.env.REFRESH_ONGOING_PAGES || 6)
const COMPLETED_PAGES = Number(process.env.REFRESH_COMPLETED_PAGES || 3)
const FRESH_BUDGET = Number(process.env.REFRESH_FRESH_BUDGET || 12)
const SYNC_WALL_MS = Number(process.env.REFRESH_WALL_MS || 25000)
const METADATA_MAX_ERROR_LEN = 500
const METADATA_RETRY_BASE_MS = 60 * 60 * 1000
const METADATA_RETRY_CAP_MS = 24 * 60 * 60 * 1000
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const WRITES_PAUSED = process.env.DISABLE_DB_WRITES === '1'

const animeRunning = new Map<number, boolean>()
let catalogSyncRunning = false
let lastCatalogSync = 0

interface CatalogStats {
  startedAt: string
  finishedAt: string
  durationMs: number
  sourcesRegistered: Record<string, number>
  flipRefreshed: number
  freshRefreshed: number
  failedPages: number
  metadataPending: number
  metadataResolved: number
  deferredByBackoff: number
}

let lastCatalogStats: CatalogStats | null = null

export function getLastCatalogStats(): CatalogStats | null {
  return lastCatalogStats
}

const VALID_DAYS = new Set(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'])

function waitUntil(event: H3Event, promise: Promise<unknown>): void {
  const withWaitUntil = event as H3Event & { waitUntil?: (p: Promise<unknown>) => void }
  if (withWaitUntil.waitUntil) {
    withWaitUntil.waitUntil(promise)
    return
  }
  promise.catch(() => {})
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

function retryDelayMs(attempts: number): number {
  const step = Math.max(1, attempts)
  const delay = METADATA_RETRY_BASE_MS * Math.pow(2, step - 1)
  return Math.min(delay, METADATA_RETRY_CAP_MS)
}

function parseOdYear(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.match(/(\d{4})/)
  if (!match) return null
  const year = Number(match[1])
  return year >= 1990 && year <= 2100 ? year : null
}

function truncateError(message: string): string {
  return message.length > METADATA_MAX_ERROR_LEN ? message.slice(0, METADATA_MAX_ERROR_LEN) : message
}

async function recordMetadataFailure(slug: string, message: string): Promise<void> {
  try {
    const [row] = await db()
      .select({ attempts: anime.metadataAttempts })
      .from(anime)
      .where(eq(anime.slug, slug))
      .limit(1)
    const nextAttempts = (row?.attempts ?? 0) + 1
    const retryAt = new Date(Date.now() + retryDelayMs(nextAttempts))
    await db()
      .update(anime)
      .set({
        metadataAttempts: nextAttempts,
        metadataLastError: truncateError(message),
        metadataRetryAt: retryAt,
      })
      .where(eq(anime.slug, slug))
  }
  catch (error) {
    console.warn(`[metadata] record failure failed ${slug}:`, error instanceof Error ? error.message : error)
  }
}

export async function getPendingMetadataStats(): Promise<{ count: number, oldestUpdatedAt: string | null, oldestAgeMs: number | null }> {
  const [row] = await db()
    .select({
      count: sql<number>`count(*)`,
      oldest: sql<number | null>`min(${anime.updatedAt})`,
    })
    .from(anime)
    .where(isNull(anime.malId))
  const count = row?.count ?? 0
  const oldestMs = row?.oldest ?? null
  return {
    count,
    oldestUpdatedAt: oldestMs ? new Date(oldestMs).toISOString() : null,
    oldestAgeMs: oldestMs ? Date.now() - oldestMs : null,
  }
}

export interface MetadataFailure {
  slug: string
  title: string
  attempts: number
  lastError: string | null
  retryAt: string | null
  updatedAt: string | null
}

export async function getMetadataFailures(limit = 20): Promise<{ total: number, failures: MetadataFailure[] }> {
  const [countRow] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(anime)
    .where(sql`${anime.metadataAttempts} > 0`)
  const rows = await db()
    .select({
      slug: anime.slug,
      title: anime.title,
      attempts: anime.metadataAttempts,
      lastError: anime.metadataLastError,
      retryAt: anime.metadataRetryAt,
      updatedAt: anime.updatedAt,
    })
    .from(anime)
    .where(sql`${anime.metadataAttempts} > 0`)
    .orderBy(sql`${anime.metadataAttempts} desc`)
    .limit(Math.max(1, Math.min(100, limit)))
  return {
    total: countRow?.count ?? 0,
    failures: rows.map((row: any) => ({
      slug: row.slug,
      title: row.title,
      attempts: row.attempts ?? 0,
      lastError: row.lastError,
      retryAt: row.retryAt ? row.retryAt.toISOString() : null,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    })),
  }
}

export async function getCatalogHealth() {
  const [pending, failures] = await Promise.all([
    getPendingMetadataStats(),
    getMetadataFailures(20),
  ])
  return {
    checkedAt: new Date().toISOString(),
    pendingMetadata: pending,
    metadataFailures: failures,
    lastCatalogSync: lastCatalogStats,
    config: {
      ongoingPages: ONGOING_PAGES,
      completedPages: COMPLETED_PAGES,
      catalogMetaBudget: CATALOG_META_BUDGET,
      catalogSyncMs: CATALOG_SYNC_MS,
      freshBudget: FRESH_BUDGET,
      wallMs: SYNC_WALL_MS,
    },
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
  const bySlug = new Map(stored.map((genre: any) => [genre.slug, genre.id]))

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

async function applyMalMetadata(slug: string, mal: NonNullable<Awaited<ReturnType<typeof fetchMalAnime>>>) {
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
      metadataAttempts: 0,
      metadataLastError: null,
      metadataRetryAt: null,
    })
    .where(eq(anime.slug, slug))
  await syncGenres(slug, mal.genres)
  await mirrorAnimeMedia(poster, characters)
}

async function stealIfPreferred(slug: string, malId: number): Promise<boolean> {
  const [owner] = await db().select({ slug: anime.slug }).from(anime).where(eq(anime.malId, malId)).limit(1)
  if (!owner || owner.slug === slug) return false
  const mine = splitSource(slug).source.priority
  const theirs = splitSource(owner.slug).source.priority
  if (mine >= theirs) return false
  await db().update(anime).set({ malId: null, metadataSyncedAt: null }).where(eq(anime.slug, owner.slug))
  console.log(`[metadata] ${slug} takes mal_id ${malId} from ${owner.slug}`)
  return true
}

export async function resolveMetadata(slug: string, title: string): Promise<boolean> {
  let entries: { id: number, title: string }[] = []
  try {
    entries = await searchMalAnimeEntries(title)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordMetadataFailure(slug, `MAL search unavailable: ${message}`)
    console.warn(`[metadata] failed ${slug}:`, message)
    return false
  }

  const ranked = rankMalAnimeMatches(title, entries)
  if (ranked.length === 0) {
    const top = entries[0]?.title ?? '-'
    await recordMetadataFailure(slug, `no MAL title matches "${title}" (top: "${top}")`)
    console.warn(`[metadata] no MAL title matches "${title}" (top: "${top}")`)
    return false
  }

  let lastReason = 'no usable MAL candidate'
  let odYear: number | null | undefined
  const loadOdYear = async (): Promise<number | null> => {
    if (odYear !== undefined) return odYear
    try {
      const detail = await scrapeAnimeDetailFresh(slug)
      odYear = parseOdYear(detail?.releaseDate ?? null)
    }
    catch {
      odYear = null
    }
    return odYear
  }

  for (const candidate of ranked.slice(0, 4)) {
    let mal = null
    try {
      mal = await fetchMalAnime(candidate.id)
    }
    catch (error) {
      lastReason = error instanceof Error ? error.message : String(error)
      continue
    }
    if (!mal) {
      lastReason = `MAL fetch returned empty for id ${candidate.id}`
      continue
    }

    try {
      const [owner] = await db()
        .select({ slug: anime.slug })
        .from(anime)
        .where(eq(anime.malId, mal.malId))
        .limit(1)
      if (owner && owner.slug !== slug) {
        const expectedYear = await loadOdYear()
        const siteSeason = seasonNumber(title)
        const candidateSeason = seasonNumber(candidate.title)
        const yearMismatch = expectedYear != null && mal.year != null && expectedYear !== mal.year
        const looksLikeSequel = siteSeason != null && siteSeason > 1
        if (yearMismatch && (looksLikeSequel || candidateSeason != null)) {
          lastReason = `mal_id ${mal.malId} owned by ${owner.slug}, year mismatch OD ${expectedYear} vs MAL ${mal.year}, trying next candidate`
          console.warn(`[metadata] sequel guard ${slug}: ${lastReason}`)
          continue
        }
        if (await stealIfPreferred(slug, mal.malId)) {
          await applyMalMetadata(slug, mal)
          return true
        }
        lastReason = `mal_id ${mal.malId} already owned by a preferred row ${owner.slug}`
        await recordMetadataFailure(slug, lastReason)
        console.warn(`[metadata] mal_id ${mal.malId} already owned by a preferred row, skipping ${slug}`)
        return false
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lastReason = message
      continue
    }

    try {
      await applyMalMetadata(slug, mal)
      return true
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('UNIQUE constraint failed') && await stealIfPreferred(slug, mal.malId)) {
        await applyMalMetadata(slug, mal)
        return true
      }
      if (message.includes('UNIQUE constraint failed')) {
        lastReason = `mal_id ${mal.malId} already owned by a preferred row`
        await recordMetadataFailure(slug, lastReason)
        console.warn(`[metadata] mal_id ${mal.malId} already owned by a preferred row, skipping ${slug}`)
        return false
      }
      throw error
    }
  }

  await recordMetadataFailure(slug, lastReason)
  console.warn(`[metadata] failed ${slug}: ${lastReason}`)
  return false
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
      const [beforeRow] = await db()
        .select({ max: sql<number | null>`max(${episodes.number})` })
        .from(episodes)
        .where(eq(episodes.animeSlug, slug))
      const maxBefore = Number(beforeRow?.max ?? 0)
      await upsertEpisodes(slug, detail.episodes)
      const [afterRow] = await db()
        .select({ max: sql<number | null>`max(${episodes.number})` })
        .from(episodes)
        .where(eq(episodes.animeSlug, slug))
      const maxAfter = Number(afterRow?.max ?? 0)
      await db()
        .update(anime)
        .set({
          title: detail.title || title,
          status,
          ...(status === 'COMPLETED' ? { day: null, ongoingRank: null } : {}),
          ...(latestEpisodeAt ? { latestEpisodeAt } : {}),
          ...(maxAfter > maxBefore ? { lastNewEpisodeAt: new Date() } : {}),
          updatedAt: new Date(),
        })
        .where(eq(anime.slug, slug))
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

export function scheduleAnimeRefresh(event: H3Event, malId: number): void {
  if (WRITES_PAUSED) return
  if (animeRunning.get(malId)) return
  animeRunning.set(malId, true)
  const task = (async () => {
    try {
      const [row] = await db()
        .select({
          slug: anime.slug,
          title: anime.title,
          status: anime.status,
          updatedAt: anime.updatedAt,
          metadataSyncedAt: anime.metadataSyncedAt,
          episodeCount: sql<number>`(select count(*) from episodes e where e.anime_slug = ${anime.slug})`,
        })
        .from(anime)
        .where(eq(anime.malId, malId))
        .limit(1)
      if (!row) return

      const now = Date.now()
      const stale = !row.updatedAt || now - row.updatedAt.getTime() > DETAIL_REFRESH_MS
      const needsMetadata = !row.metadataSyncedAt || now - row.metadataSyncedAt.getTime() > METADATA_REFRESH_MS
      const hasEpisodes = Number(row.episodeCount) > 0

      if ((row.status === 'ONGOING' && stale) || !hasEpisodes) {
        await refreshAnimeBySlug(row.slug, row.title, needsMetadata)
      }
    }
    finally {
      animeRunning.delete(malId)
    }
  })().catch(error => console.warn(`[refresh] anime ${malId} failed:`, error instanceof Error ? error.message : error))
  waitUntil(event, task)
}

async function registerOngoingCards(cards: { source: AnimeSource, slug: string, title: string, day?: string, date?: string, ongoingRank: number }[]) {
  if (cards.length === 0) return
  const rows = cards.map(card => ({
    slug: `${card.source.id}:${card.slug}`,
    title: card.title,
    day: card.day && VALID_DAYS.has(card.day) ? card.day : null,
    latestEpisodeAt: card.date ? parseEpisodeDate(card.date) : null,
    ongoingRank: card.ongoingRank,
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

async function refreshFlipCandidates(ongoingSlugs: Set<string>, deadlineMs: number): Promise<number> {
  const completedSlugs: string[] = []
  for (const source of getSources()) {
    for (let page = 1; page <= COMPLETED_PAGES; page++) {
      try {
        const result = await source.completedFresh(page)
        if (result.anime.length === 0) break
        for (const card of result.anime) {
          completedSlugs.push(`${source.id}:${card.slug}`)
        }
      }
      catch (error) {
        console.warn(`[catalog] ${source.id} completed page ${page} failed, continuing:`, error instanceof Error ? error.message : error)
      }
      await sleep(250)
    }
  }
  if (completedSlugs.length === 0) return 0

  const statusRows = await db()
    .select({ slug: anime.slug, title: anime.title, status: anime.status })
    .from(anime)
    .where(inArray(anime.slug, completedSlugs))
  const flips = statusRows.filter(row => row.status === 'ONGOING')
  let refreshed = 0
  for (const row of flips) {
    if (Date.now() > deadlineMs) break
    try {
      await refreshAnimeBySlug(row.slug, row.title, false)
      refreshed++
    }
    catch (error) {
      console.warn(`[catalog] flip refresh failed ${row.slug}:`, error instanceof Error ? error.message : error)
    }
  }

  try {
    const dbOngoing = await db()
      .select({ slug: anime.slug, title: anime.title })
      .from(anime)
      .where(eq(anime.status, 'ONGOING'))
      .limit(500)
    for (const row of dbOngoing) {
      if (refreshed >= 12 || Date.now() > deadlineMs) break
      if (!ongoingSlugs.has(row.slug) && !flips.some(item => item.slug === row.slug)) {
        try {
          await refreshAnimeBySlug(row.slug, row.title, false)
          refreshed++
        }
        catch (error) {
          console.warn(`[catalog] disappeared refresh failed ${row.slug}:`, error instanceof Error ? error.message : error)
        }
      }
      if (refreshed >= 12) break
    }
  }
  catch (error) {
    console.warn('[catalog] disappeared scan failed, continuing:', error instanceof Error ? error.message : error)
  }
  if (flips.length > 0 || refreshed > 0) {
    console.log(`[catalog] flip fast path: ${flips.length} completed hits, ${refreshed} refreshed`)
  }
  return refreshed
}

async function refreshFreshEpisodes(
  cards: { slug: string, title: string, episode: string }[],
  deadlineMs: number,
): Promise<number> {
  const wanted = cards
    .map(card => ({ slug: card.slug, title: card.title, episode: episodeNumber(card.episode) }))
    .filter(item => item.episode != null)
  if (wanted.length === 0) return 0
  const dbMax = new Map<string, number>()
  const chunkSize = 50
  for (let i = 0; i < wanted.length; i += chunkSize) {
    const chunk = wanted.slice(i, i + chunkSize)
    const rows = await db()
      .select({ slug: episodes.animeSlug, max: sql<number>`max(${episodes.number})` })
      .from(episodes)
      .where(inArray(episodes.animeSlug, chunk.map(item => item.slug)))
      .groupBy(episodes.animeSlug)
    for (const row of rows) {
      dbMax.set((row as { slug: string }).slug, Number((row as { max: number | null }).max ?? 0))
    }
  }
  let refreshed = 0
  for (const item of wanted) {
    if (refreshed >= FRESH_BUDGET || Date.now() > deadlineMs) break
    if (item.episode != null && item.episode > (dbMax.get(item.slug) ?? 0)) {
      try {
        await refreshAnimeBySlug(item.slug, item.title, false)
        refreshed++
      }
      catch (error) {
        console.warn(`[catalog] fresh refresh failed ${item.slug}:`, error instanceof Error ? error.message : error)
      }
    }
  }
  if (refreshed > 0) {
    console.log(`[catalog] fresh episodes: ${refreshed} refreshed`)
  }
  return refreshed
}

async function syncOngoingCatalog(): Promise<void> {
  const startedAt = new Date()
  const deadlineMs = startedAt.getTime() + SYNC_WALL_MS
  const sourcesRegistered: Record<string, number> = {}
  let failedPages = 0
  const ongoingSlugs = new Set<string>()
  let ongoingRank = 0
  for (const source of getSources()) {
    try {
      const cards = []
      for (let page = 1; page <= ONGOING_PAGES; page++) {
        try {
          const result = await source.ongoingFresh(page)
          if (result.anime.length === 0) break
          for (const card of result.anime) {
            ongoingRank++
            cards.push({ source, slug: card.slug, title: card.title, day: card.day, date: card.date, episode: card.episode, ongoingRank })
            ongoingSlugs.add(`${source.id}:${card.slug}`)
          }
        }
        catch (error) {
          failedPages++
          console.warn(`[catalog] ${source.id} ongoing page ${page} failed, continuing:`, error instanceof Error ? error.message : error)
        }
        await sleep(250)
      }
      await registerOngoingCards(cards)
      sourcesRegistered[source.id] = cards.length
      console.log(`[catalog] ${source.id}: registered ${cards.length} ongoing cards`)
    }
    catch (error) {
      console.warn(`[catalog] ${source.id} ongoing sync failed:`, error instanceof Error ? error.message : error)
    }
  }

  let flipRefreshed = 0
  try {
    flipRefreshed = await refreshFlipCandidates(ongoingSlugs, deadlineMs)
  }
  catch (error) {
    console.warn('[catalog] flip pass failed, continuing to metadata:', error instanceof Error ? error.message : error)
  }

  let freshRefreshed = 0
  try {
    freshRefreshed = await refreshFreshEpisodes(
      cards.map(item => ({ slug: `${item.source.id}:${item.slug}`, title: item.title, episode: item.episode })),
      deadlineMs,
    )
  }
  catch (error) {
    console.warn('[catalog] fresh pass failed, continuing to metadata:', error instanceof Error ? error.message : error)
  }

  const now = new Date()
  const retryReady = or(isNull(anime.metadataRetryAt), lt(anime.metadataRetryAt, now))
  const eligibleWhere = and(isNull(anime.malId), retryReady)
  const [totalRow] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(anime)
    .where(isNull(anime.malId))
  const totalPending = totalRow?.count ?? 0
  const [eligibleRow] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(anime)
    .where(eligibleWhere)
  const eligibleTotal = eligibleRow?.count ?? 0
  const deferredByBackoff = Math.max(0, totalPending - eligibleTotal)

  const pending = await db()
    .select({ slug: anime.slug, title: anime.title })
    .from(anime)
    .where(eligibleWhere)
    .orderBy(sql`case when ${anime.status} = 'ONGOING' then 0 else 1 end`, sql`random()`)
    .limit(CATALOG_META_BUDGET)
  console.log(`[catalog] ${totalPending} rows need MAL metadata, ${deferredByBackoff} deferred by backoff, processing ${pending.length}`)
  let resolved = 0
  for (const row of pending) {
    if (Date.now() > deadlineMs) break
    try {
      if (await resolveMetadata(row.slug, row.title)) {
        resolved++
        console.log(`[catalog] metadata resolved: ${row.slug}`)
      }
    }
    catch (error) {
      console.warn(`[catalog] metadata deferred ${row.slug}:`, error instanceof Error ? error.message : error)
    }
    await sleep(600)
  }

  lastCatalogStats = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    sourcesRegistered,
    flipRefreshed,
    freshRefreshed,
    failedPages,
    metadataPending: totalPending,
    metadataResolved: resolved,
    deferredByBackoff,
  }
}

export function scheduleCatalogSync(event: H3Event): void {
  if (WRITES_PAUSED) return
  const now = Date.now()
  if (catalogSyncRunning || now - lastCatalogSync < CATALOG_SYNC_MS) return
  lastCatalogSync = now
  catalogSyncRunning = true
  const task = syncOngoingCatalog()
    .catch(error => console.warn('[catalog] sync failed:', error instanceof Error ? error.message : error))
    .finally(() => { catalogSyncRunning = false })
  waitUntil(event, task)
}

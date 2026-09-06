import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { anime, animeGenres, episodes, genres } from '../database/schema'
import { db } from './db'
import { fetchMalAnime, rankMalAnimeMatches, searchMalAnimeEntries, seasonNumber } from './mal'
import { mirrorAnimeMedia } from './media-mirror'
import { toR2Url } from './r2'
import { parseEpisodeDate, scrapeAnimeDetailFresh, scrapeCompletedFresh, scrapeOngoingFresh } from './scraper'

const OTAKUDESU_BASE = 'https://otakudesu.blog'
const ONGOING_PAGES = Number(process.env.SCRAPE_PAGES || 6)
const COMPLETED_PAGES = Number(process.env.SCRAPE_COMPLETED_PAGES || 3)
const METADATA_STALE_DAYS = Number(process.env.SCRAPE_STALE_DAYS || 7)
const SITE_DELAY_MS = Number(process.env.SCRAPE_SITE_DELAY_MS || 400)
const MAL_DELAY_MS = Number(process.env.SCRAPE_MAL_DELAY_MS || 600)
const CONCURRENCY = Number(process.env.SCRAPE_CONCURRENCY || 4)
const DETAIL_BUDGET = Number(process.env.SCRAPE_DETAIL_BUDGET || 12)
const META_BUDGET = Number(process.env.SCRAPE_META_BUDGET || 6)
const WALL_BUDGET_MS = Number(process.env.SCRAPE_WALL_BUDGET_MS || 25000)
const DETAIL_GRACE_MS = Number(process.env.SCRAPE_DETAIL_GRACE_MS || 6 * 60 * 60 * 1000)
const ACTIVE_REFRESH_MS = Number(process.env.SCRAPE_ACTIVE_REFRESH_HOURS || 24) * 60 * 60 * 1000
const METADATA_MAX_ERROR_LEN = 500
const METADATA_RETRY_BASE_MS = 60 * 60 * 1000
const METADATA_RETRY_CAP_MS = 24 * 60 * 60 * 1000

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

const VALID_DAYS = new Set(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'])

interface RegisterCard {
  slug: string
  title: string
  day?: string
  date?: string
  ongoingRank?: number | null
}

async function registerAnimeRows(cards: RegisterCard[]) {
  const rows = cards.map(card => ({
    slug: card.slug,
    title: card.title,
    day: card.day && VALID_DAYS.has(card.day) ? card.day : null,
    latestEpisodeAt: card.date ? parseEpisodeDate(card.date) : null,
    ongoingRank: card.ongoingRank ?? null,
    sourceUrl: `${OTAKUDESU_BASE}/anime/${card.slug}/`,
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
  const rows = list
    .map(entry => ({ entry, number: episodeNumber(entry.slug) ?? episodeNumber(entry.title) }))
    .filter((row): row is { entry: typeof list[number], number: number } => row.number !== null)

  if (rows.length === 0) return

  const chunkSize = 15
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

function pendingMetadataWhere(mode: 'cron' | 'full', staleCutoff: Date) {
  return mode === 'cron'
    ? or(isNull(anime.malId), isNull(anime.metadataSyncedAt))
    : or(isNull(anime.malId), lt(anime.metadataSyncedAt, staleCutoff))
}

export async function countPendingStructure(): Promise<number> {
  const staleCutoff = new Date(Date.now() - METADATA_STALE_DAYS * 24 * 60 * 60 * 1000)
  const detailGrace = new Date(Date.now() - DETAIL_GRACE_MS)
  const activeRefresh = new Date(Date.now() - ACTIVE_REFRESH_MS)
  const [row] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(anime)
    .where(pendingStructureWhere(staleCutoff.getTime(), detailGrace.getTime(), activeRefresh.getTime()))
  return row?.count ?? 0
}

export async function countPendingMetadata(mode: 'cron' | 'full'): Promise<number> {
  const staleCutoff = new Date(Date.now() - METADATA_STALE_DAYS * 24 * 60 * 60 * 1000)
  const [row] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(anime)
    .where(pendingMetadataWhere(mode, staleCutoff))
  return row?.count ?? 0
}

export async function getPendingStructureStats(): Promise<{ count: number, oldestUpdatedAt: string | null, oldestAgeMs: number | null }> {
  const staleCutoff = new Date(Date.now() - METADATA_STALE_DAYS * 24 * 60 * 60 * 1000)
  const detailGrace = new Date(Date.now() - DETAIL_GRACE_MS)
  const activeRefresh = new Date(Date.now() - ACTIVE_REFRESH_MS)
  const [row] = await db()
    .select({
      count: sql<number>`count(*)`,
      oldest: sql<number | null>`min(${anime.updatedAt})`,
    })
    .from(anime)
    .where(pendingStructureWhere(staleCutoff.getTime(), detailGrace.getTime(), activeRefresh.getTime()))
  const count = row?.count ?? 0
  const oldestMs = row?.oldest ?? null
  return {
    count,
    oldestUpdatedAt: oldestMs ? new Date(oldestMs).toISOString() : null,
    oldestAgeMs: oldestMs ? Date.now() - oldestMs : null,
  }
}

export async function getPendingMetadataStats(mode: 'cron' | 'full' = 'cron'): Promise<{ count: number, oldestUpdatedAt: string | null, oldestAgeMs: number | null }> {
  const staleCutoff = new Date(Date.now() - METADATA_STALE_DAYS * 24 * 60 * 60 * 1000)
  const [row] = await db()
    .select({
      count: sql<number>`count(*)`,
      oldest: sql<number | null>`min(${anime.updatedAt})`,
    })
    .from(anime)
    .where(pendingMetadataWhere(mode, staleCutoff))
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
          synopsisId: detail.synopsis || null,
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

  const cards: { slug: string, title: string, day?: string, date?: string, ongoingRank?: number | null, episodeNumber?: number | null, fromCompleted?: boolean }[] = []
  let ongoingRank = 0
  let failedPages = 0
  for (let page = 1; page <= ONGOING_PAGES; page++) {
    try {
      const result = await scrapeOngoingFresh(page)
      for (const card of result.anime) {
        ongoingRank++
        cards.push({ slug: card.slug, title: card.title, day: card.day, date: card.date, ongoingRank, episodeNumber: episodeNumber(card.episode), fromCompleted: false })
      }
    }
    catch (error) {
      failedPages++
      console.warn(`[structure] ongoing page ${page} failed, continuing:`, error instanceof Error ? error.message : error)
    }
  }
  for (let page = 1; page <= COMPLETED_PAGES; page++) {
    try {
      const result = await scrapeCompletedFresh(page)
      cards.push(...result.anime.map(card => ({ slug: card.slug, title: card.title, day: card.day, date: card.date, ongoingRank: null, episodeNumber: null as number | null, fromCompleted: true })))
    }
    catch (error) {
      failedPages++
      console.warn(`[structure] completed page ${page} failed, continuing:`, error instanceof Error ? error.message : error)
    }
  }

  const seen = new Set<string>()
  const unique = cards.filter(card => !seen.has(card.slug) && seen.add(card.slug))
  if (unique.length > 0) {
    await registerAnimeRows(unique)
  }

  const ongoingScrapedSlugs = new Set(unique.filter(card => !card.fromCompleted).map(card => card.slug))
  const completedScraped = unique.filter(card => card.fromCompleted)
  const titleBySlug = new Map(unique.map(card => [card.slug, card.title]))

  const flipCandidates: Candidate[] = []
  try {
    if (completedScraped.length > 0) {
      const completedSlugs = completedScraped.map(card => card.slug)
      const statusRows = await db()
        .select({ slug: anime.slug, title: anime.title, status: anime.status })
        .from(anime)
        .where(inArray(anime.slug, completedSlugs))
      for (const row of statusRows) {
        if (row.status === 'ONGOING' || row.status === null) {
          flipCandidates.push({ slug: row.slug, title: row.title })
        }
      }
    }
    const dbOngoing = await db()
      .select({ slug: anime.slug, title: anime.title })
      .from(anime)
      .where(eq(anime.status, 'ONGOING'))
      .limit(500)
    for (const row of dbOngoing) {
      if (!ongoingScrapedSlugs.has(row.slug) && !flipCandidates.some(item => item.slug === row.slug)) {
        const completedHit = completedScraped.some(card => card.slug === row.slug)
        if (completedHit || !titleBySlug.has(row.slug)) {
          flipCandidates.push({ slug: row.slug, title: titleBySlug.get(row.slug) ?? row.title })
        }
      }
    }
  }
  catch (error) {
    console.warn('[structure] flip detection failed, continuing without fast path:', error instanceof Error ? error.message : error)
  }

  const ongoingSlugs = unique.filter(card => card.episodeNumber != null).map(card => card.slug)
  const freshSet = new Set<string>()
  if (ongoingSlugs.length > 0) {
    const episodeRows = await db()
      .select({ slug: episodes.animeSlug, max: sql<number>`max(${episodes.number})` })
      .from(episodes)
      .where(inArray(episodes.animeSlug, ongoingSlugs))
      .groupBy(episodes.animeSlug)
    const dbMax = new Map(episodeRows.map((row: any) => [row.slug, row.max] as [string, number]))
    for (const card of unique) {
      if (card.episodeNumber != null && card.episodeNumber > Number(dbMax.get(card.slug) ?? 0)) {
        freshSet.add(card.slug)
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
  for (const item of flipCandidates) {
    if (targets.length >= DETAIL_BUDGET) break
    if (!targetSet.has(item.slug)) {
      targets.push(item)
      targetSet.add(item.slug)
    }
  }
  for (const card of unique) {
    if (targets.length >= DETAIL_BUDGET) break
    if (freshSet.has(card.slug) && !targetSet.has(card.slug)) {
      targets.push({ slug: card.slug, title: card.title })
      targetSet.add(card.slug)
    }
  }
  for (const candidate of candidates) {
    if (targets.length >= DETAIL_BUDGET) break
    if (!targetSet.has(candidate.slug)) {
      targets.push(candidate)
      targetSet.add(candidate.slug)
    }
  }
  console.log(`[structure] ${candidates.length + freshSet.size} anime need detail sync (${freshSet.size} with new episodes, ${flipCandidates.length} flip fast path, ${failedPages} failed pages), processing ${targets.length}`)

  let done = 0
  await pool(targets, async ({ slug, title }) => {
    await refreshAnimeBySlug(slug, title, false)
    done++
    if (done % 25 === 0) console.log(`[structure] ${done}/${targets.length}`)
  }, startedAt + WALL_BUDGET_MS)
  const totalRemaining = await countPendingStructure()
  console.log(`[structure] done (${done}/${targets.length} anime)`)
  return { candidates: candidates.length, done, remaining: totalRemaining, failedPages }
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

async function applyMetadataSuccess(slug: string, mal: {
  malId: number
  synopsis: string
  poster: string | null
  score: number | null
  rank: number | null
  popularity: number | null
  season: string | null
  year: number | null
  trailerId: string | null
  studio: string | null
  source: string | null
  genres: string[]
  characters: { name: string, imageUrl: string, role: 'Main' | 'Supporting', voiceActor?: { name: string, imageUrl: string } }[]
}): Promise<boolean> {
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
        metadataAttempts: 0,
        metadataLastError: null,
        metadataRetryAt: null,
      })
      .where(eq(anime.slug, slug))
    await syncGenres(slug, mal.genres)
    await mirrorAnimeMedia(poster, characters)
    return true
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('UNIQUE constraint failed')) {
      await recordMetadataFailure(slug, `mal_id ${mal.malId} already owned by another row`)
      console.warn(`[metadata] mal_id ${mal.malId} already owned by another row, skipping ${slug}`)
      return false
    }
    throw error
  }
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
        if (yearMismatch && (looksLikeSequel || candidateSeason != null || expectedYear !== mal.year)) {
          lastReason = `mal_id ${mal.malId} owned by ${owner.slug}, year mismatch OD ${expectedYear} vs MAL ${mal.year}, trying next candidate`
          console.warn(`[metadata] sequel guard ${slug}: ${lastReason}`)
          continue
        }
        lastReason = `mal_id ${mal.malId} already owned by ${owner.slug}`
        await recordMetadataFailure(slug, lastReason)
        console.warn(`[metadata] mal_id ${mal.malId} already owned by another row, skipping ${slug}`)
        return false
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lastReason = message
      continue
    }

    const applied = await applyMetadataSuccess(slug, mal)
    if (applied) return true
    lastReason = `mal_id ${mal.malId} already owned by another row`
    return false
  }

  await recordMetadataFailure(slug, lastReason)
  console.warn(`[metadata] failed ${slug}: ${lastReason}`)
  return false
}

async function metadataPass(mode: 'cron' | 'full') {
  const staleCutoff = new Date(Date.now() - METADATA_STALE_DAYS * 24 * 60 * 60 * 1000)
  const startedAt = Date.now()
  const now = new Date()

  const totalPending = await countPendingMetadata(mode)
  const retryReady = or(isNull(anime.metadataRetryAt), lt(anime.metadataRetryAt, now))
  const baseWhere = pendingMetadataWhere(mode, staleCutoff)
  const eligibleWhere = baseWhere ? and(baseWhere, retryReady) : retryReady
  const [eligibleRow] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(anime)
    .where(eligibleWhere)
  const eligibleTotal = eligibleRow?.count ?? 0
  const deferredByBackoff = Math.max(0, totalPending - eligibleTotal)

  const targets: Candidate[] = await db()
    .select({ slug: anime.slug, title: anime.title })
    .from(anime)
    .where(eligibleWhere)
    .orderBy(sql`case when ${anime.malId} is null and ${anime.status} = 'ONGOING' then 0 when ${anime.malId} is null then 1 else 2 end`, sql`random()`)
    .limit(META_BUDGET)
  console.log(`[metadata] ${totalPending} anime need MAL metadata (${mode}), ${deferredByBackoff} deferred by backoff, processing ${targets.length}`)

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
  return { pending: totalPending, resolved, deferred: failed, remaining: totalRemaining }
}

export interface ScrapeStats {
  mode: 'cron' | 'full'
  startedAt: string
  finishedAt: string
  durationMs: number
  completed: boolean
  skipped?: boolean
  structure: { candidates: number, done: number, remaining: number, failedPages?: number }
  metadata: { pending: number, resolved: number, deferred: number, remaining: number }
}

let activeRun = false
let lastStats: ScrapeStats | null = null

export function getLastScrapeStats(): ScrapeStats | null {
  return lastStats
}

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
    let structure = { candidates: 0, done: 0, remaining: 0, failedPages: 0 }
    let metadata = { pending: 0, resolved: 0, deferred: 0, remaining: 0 }
    try {
      structure = await structurePass()
    }
    catch (error) {
      console.error('[scrape] structure pass failed:', error instanceof Error ? error.message : error)
    }
    try {
      metadata = await metadataPass(mode)
    }
    catch (error) {
      console.error('[scrape] metadata pass failed:', error instanceof Error ? error.message : error)
    }
    const stats: ScrapeStats = {
      mode,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      completed: structure.remaining === 0 && metadata.remaining === 0,
      structure,
      metadata,
    }
    lastStats = stats
    return stats
  }
  finally {
    activeRun = false
  }
}

export async function getScrapeHealth(mode: 'cron' | 'full' = 'cron') {
  const [structure, metadata, failures] = await Promise.all([
    getPendingStructureStats(),
    getPendingMetadataStats(mode),
    getMetadataFailures(20),
  ])
  return {
    mode,
    checkedAt: new Date().toISOString(),
    pendingStructure: structure,
    pendingMetadata: metadata,
    metadataFailures: failures,
    lastRun: getLastScrapeStats(),
    config: {
      ongoingPages: ONGOING_PAGES,
      completedPages: COMPLETED_PAGES,
      detailBudget: DETAIL_BUDGET,
      metaBudget: META_BUDGET,
      wallBudgetMs: WALL_BUDGET_MS,
    },
  }
}

import type { H3Event } from 'h3'
import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { anime, animeGenres, episodes, genres } from '../database/schema'
import { db } from './db'
import { fetchMalAnime, malSearchVariants, rankMalAnimeMatches, searchMalAnimeEntries, seasonNumber } from './mal'
import { mirrorAnimeMedia } from './r2'
import { toR2Url } from './r2'
import { getSources, scrapeAnimeDetailFresh } from './sources'
import type { AnimeSource } from './sources/types'
import { parseEpisodeDate } from './sources/shared'

const DETAIL_REFRESH_MS = 6 * 60 * 60 * 1000
const METADATA_REFRESH_MS = 7 * 24 * 60 * 60 * 1000
const CATALOG_SYNC_MS = 10 * 60 * 1000
const CATALOG_META_BUDGET = 10
const ONGOING_PAGES = 6
const COMPLETED_PAGES = 3
const FRESH_BUDGET = 12
const RETRY_MS = 24 * 60 * 60 * 1000
const BIND_CHUNK_SIZE = 40

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size))
  return chunks
}

let catalogSyncRunning = false
let lastCatalogSync = 0

interface CatalogStats {
  startedAt: string
  finishedAt: string
  durationMs: number
  sourcesRegistered: Record<string, number>
  freshRefreshed: number
  metadataPending: number
  metadataResolved: number
}

let lastCatalogStats: CatalogStats | null = null

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

function parseOdYear(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.match(/(\d{4})/)
  if (!match) return null
  const year = Number(match[1])
  return year >= 1990 && year <= 2100 ? year : null
}

async function recordFailure(slug: string, message: string): Promise<void> {
  try {
    await db()
      .update(anime)
      .set({
        metadataAttempts: sql`${anime.metadataAttempts} + 1`,
        metadataLastError: message.slice(0, 500),
        metadataRetryAt: new Date(Date.now() + RETRY_MS),
      })
      .where(eq(anime.slug, slug))
  }
  catch (error) {
    console.warn(`[metadata] record failure failed ${slug}:`, error instanceof Error ? error.message : error)
  }
}

export async function getCatalogHealth() {
  const [row] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(anime)
    .where(isNull(anime.malId))
  return {
    checkedAt: new Date().toISOString(),
    pendingMetadata: row?.count ?? 0,
    lastCatalogSync: lastCatalogStats,
    config: {
      ongoingPages: ONGOING_PAGES,
      completedPages: COMPLETED_PAGES,
      catalogMetaBudget: CATALOG_META_BUDGET,
      catalogSyncMs: CATALOG_SYNC_MS,
      freshBudget: FRESH_BUDGET,
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

  const client = db()
  const statements = chunkValues(rows, 15).map(chunk =>
    client.insert(episodes).values(chunk.map(({ entry, number }) => ({
      animeSlug,
      slug: `${sourcePrefix}${entry.slug}`,
      number,
      title: entry.title,
      releaseDate: entry.date || null,
    }))).onConflictDoNothing(),
  )
  await client.batch(statements as [typeof statements[number], ...typeof statements[number][]])
}

async function syncGenres(animeSlug: string, names: string[]) {
  if (names.length === 0) return

  const rows = names.map(name => ({
    slug: slugify(name),
    name,
  }))
  const wantedSlugs = [...new Set(rows.map(row => row.slug))]

  const client = db()
  const genreStatements = chunkValues(rows, 30).map(chunk =>
    client.insert(genres).values(chunk).onConflictDoNothing(),
  )
  await client.batch(genreStatements as [typeof genreStatements[number], ...typeof genreStatements[number][]])
  const stored = await db()
    .select({ id: genres.id, slug: genres.slug })
    .from(genres)
    .where(inArray(genres.slug, wantedSlugs))
  const bySlug = new Map(stored.map((genre: any) => [genre.slug, genre.id]))

  const links = rows
    .map(row => bySlug.get(row.slug))
    .filter((id): id is number => id !== undefined)
    .map(id => ({ animeSlug, genreId: id }))

  const writeClient = db()
  const linkStatements = [
    writeClient.delete(animeGenres).where(eq(animeGenres.animeSlug, animeSlug)),
    ...chunkValues(links, 30).map(chunk => writeClient.insert(animeGenres).values(chunk).onConflictDoNothing()),
  ]
  if (links.length === 0) {
    await writeClient.delete(animeGenres).where(eq(animeGenres.animeSlug, animeSlug))
    return
  }
  await writeClient.batch(linkStatements as [typeof linkStatements[number], ...typeof linkStatements[number][]])
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

async function resolveMetadata(slug: string, title: string): Promise<boolean> {
  const merged = new Map<number, { id: number, title: string }>()
  for (const variant of malSearchVariants(title)) {
    const batch = await searchMalAnimeEntries(variant)
    for (const entry of batch) {
      if (!merged.has(entry.id)) merged.set(entry.id, entry)
    }
    if (merged.size >= 15) break
  }
  const entries = [...merged.values()].slice(0, 15)
  const ranked = rankMalAnimeMatches(title, entries)
  if (ranked.length === 0) {
    const top = entries[0]?.title ?? '-'
    const reason = `no MAL title matches "${title}" (top: "${top}")`
    await recordFailure(slug, reason)
    console.warn(`[metadata] no MAL title matches "${title}" (top: "${top}")`)
    return false
  }

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
  let yearFallback: { mal: NonNullable<Awaited<ReturnType<typeof fetchMalAnime>>>, diff: number } | null = null

  for (const candidate of ranked.slice(0, 6)) {
    const mal = await fetchMalAnime(candidate.id)
    if (!mal) {
      const reason = `MAL fetch returned empty for id ${candidate.id}`
      await recordFailure(slug, reason)
      console.warn(`[metadata] failed ${slug}: ${reason}`)
      continue
    }

    const siteSeason = seasonNumber(title)
    const candidateSeason = seasonNumber(candidate.title)
    if (siteSeason !== null && siteSeason > 1 && candidateSeason === null && mal.year !== null) {
      const expectedYear = await loadOdYear()
      if (expectedYear !== null && Math.abs(expectedYear - mal.year) > 1) {
        if (!yearFallback || Math.abs(expectedYear - mal.year) < yearFallback.diff) {
          yearFallback = { mal, diff: Math.abs(expectedYear - mal.year) }
        }
        continue
      }
    }

    const [owner] = await db()
      .select({ slug: anime.slug })
      .from(anime)
      .where(eq(anime.malId, mal.malId))
      .limit(1)
    if (owner && owner.slug !== slug) {
      const reason = `mal_id ${mal.malId} already owned by ${owner.slug}`
      await recordFailure(slug, reason)
      console.warn(`[metadata] mal_id ${mal.malId} already owned, skipping ${slug}`)
      return false
    }

    try {
      await applyMalMetadata(slug, mal)
      return true
    }
    catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await recordFailure(slug, reason)
      console.warn(`[metadata] failed ${slug}: ${reason}`)
      return false
    }
  }

  if (yearFallback) {
    const [owner] = await db()
      .select({ slug: anime.slug })
      .from(anime)
      .where(eq(anime.malId, yearFallback.mal.malId))
      .limit(1)
    if (!owner || owner.slug === slug) {
      try {
        await applyMalMetadata(slug, yearFallback.mal)
        return true
      }
      catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        await recordFailure(slug, reason)
        console.warn(`[metadata] failed ${slug}: ${reason}`)
        return false
      }
    }
  }

  const reason = `no usable MAL candidate for "${title}"`
  await recordFailure(slug, reason)
  console.warn(`[metadata] failed ${slug}: ${reason}`)
  return false
}

export async function refreshAnimeBySlug(slug: string, title: string, refreshMetadata: boolean): Promise<void> {
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
    const maxInDetail = detail.episodes.reduce((max, entry) => {
      const parsed = episodeNumber(entry.slug) ?? episodeNumber(entry.title)
      return parsed != null && parsed > max ? parsed : max
    }, 0)
    const maxAfter = Math.max(maxBefore, maxInDetail)
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
  if (refreshMetadata) await resolveMetadata(slug, title)
}

export function scheduleAnimeRefresh(event: H3Event, malId: number): void {
  const task = (async () => {
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
  const client = db()
  const statements = chunkValues(rows, 15).map(chunk =>
    client.insert(anime).values(chunk).onConflictDoUpdate({
      target: anime.slug,
      set: {
        day: sql`coalesce(excluded.day, ${anime.day})`,
        latestEpisodeAt: sql`coalesce(excluded.latest_episode_at, latest_episode_at)`,
        ongoingRank: sql`coalesce(excluded.ongoing_rank, ${anime.ongoingRank})`,
      },
    }),
  )
  await client.batch(statements as [typeof statements[number], ...typeof statements[number][]])
}

async function refreshFreshEpisodes(
  cards: { slug: string, title: string, episode: string }[],
): Promise<number> {
  const bySlug = new Map<string, { slug: string, title: string, episode: number }>()
  for (const card of cards) {
    const parsed = episodeNumber(card.episode)
    if (parsed == null) continue
    const current = bySlug.get(card.slug)
    if (!current || parsed > current.episode) bySlug.set(card.slug, { slug: card.slug, title: card.title, episode: parsed })
  }
  const wanted = [...bySlug.values()]
  if (wanted.length === 0) return 0
  const dbMax = new Map<string, number>()
  const maxResults = await Promise.all(chunkValues(wanted, BIND_CHUNK_SIZE).map(chunk =>
    db()
      .select({ slug: episodes.animeSlug, max: sql<number>`max(${episodes.number})` })
      .from(episodes)
      .where(inArray(episodes.animeSlug, chunk.map(item => item.slug)))
      .groupBy(episodes.animeSlug),
  ))
  for (const rows of maxResults) {
    for (const row of rows) {
      dbMax.set((row as { slug: string }).slug, Number((row as { max: number | null }).max ?? 0))
    }
  }
  let refreshed = 0
  for (const item of wanted) {
    if (refreshed >= FRESH_BUDGET) break
    if (item.episode > (dbMax.get(item.slug) ?? 0)) {
      await refreshAnimeBySlug(item.slug, item.title, false)
      refreshed++
    }
  }
  if (refreshed > 0) {
    console.log(`[catalog] fresh episodes: ${refreshed} refreshed`)
  }
  return refreshed
}

async function syncOngoingCatalog(): Promise<void> {
  const startedAt = new Date()
  const sourcesRegistered: Record<string, number> = {}
  let ongoingRank = 0
  const allCards: { source: AnimeSource, slug: string, title: string, episode: string }[] = []
  for (const source of getSources()) {
    const cards: { source: AnimeSource, slug: string, title: string, day: string, date: string, episode: string, ongoingRank: number }[] = []
    for (let page = 1; page <= ONGOING_PAGES; page++) {
      const result = await source.ongoingFresh(page)
      if (result.anime.length === 0) break
      for (const card of result.anime) {
        ongoingRank++
        cards.push({ source, slug: card.slug, title: card.title, day: card.day, date: card.date, episode: card.episode, ongoingRank })
      }
    }
    await registerOngoingCards(cards)
    allCards.push(...cards.map(card => ({ source: card.source, slug: card.slug, title: card.title, episode: card.episode })))
    sourcesRegistered[source.id] = cards.length
    console.log(`[catalog] ${source.id}: registered ${cards.length} ongoing cards`)
  }

  const freshRefreshed = await refreshFreshEpisodes(
    allCards.map(item => ({ slug: `${item.source.id}:${item.slug}`, title: item.title, episode: item.episode })),
  )

  const now = new Date()
  const eligibleWhere = and(isNull(anime.malId), or(isNull(anime.metadataRetryAt), lt(anime.metadataRetryAt, now)))
  const [totalResult] = await db().select({ count: sql<number>`count(*)` }).from(anime).where(isNull(anime.malId))
  const totalPending = totalResult?.count ?? 0

  const pending = await db()
    .select({ slug: anime.slug, title: anime.title })
    .from(anime)
    .where(eligibleWhere)
    .orderBy(sql`case when ${anime.status} = 'ONGOING' then 0 else 1 end`, asc(anime.updatedAt))
    .limit(CATALOG_META_BUDGET)
  console.log(`[catalog] ${totalPending} rows need MAL metadata, processing ${pending.length}`)
  let resolved = 0
  for (const row of pending) {
    if (await resolveMetadata(row.slug, row.title)) {
      resolved++
      console.log(`[catalog] metadata resolved: ${row.slug}`)
    }
  }

  lastCatalogStats = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    sourcesRegistered,
    freshRefreshed,
    metadataPending: totalPending,
    metadataResolved: resolved,
  }
}

export function scheduleCatalogSync(event: H3Event): void {
  const now = Date.now()
  if (catalogSyncRunning || now - lastCatalogSync < CATALOG_SYNC_MS) return
  lastCatalogSync = now
  catalogSyncRunning = true
  const task = syncOngoingCatalog()
    .catch(error => console.warn('[catalog] sync failed:', error instanceof Error ? error.message : error))
    .finally(() => { catalogSyncRunning = false })
  waitUntil(event, task)
}

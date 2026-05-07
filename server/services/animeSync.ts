import { eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { animeEpisodes, animeGenres, genres, latestFeedItems, malAnime, otakudesuAnime, syncRuns, type SyncRunType } from '../db/schema'
import { fetchPersistedJikanAnime, type JikanPersistedAnime } from '../utils/jikan'
import { scrapeAnimeDetailForSync, scrapeAnimeIndex, scrapeLatestAnime, type AnimeCard, type AnimeDetail, type AnimeIndexItem, type LatestAnimeKind } from '../utils/scraper'

interface SyncAnimeInput {
  slug: string
  titleHint?: string
  isOngoing?: boolean
  isCompleted?: boolean
  latest?: Pick<AnimeCard, 'episode' | 'day' | 'date' | 'rating'>
}

interface SyncAnimeResult {
  slug: string
  ok: boolean
  error?: string
}

interface SyncOptions {
  limit?: number
  offset?: number
  refresh?: boolean
  concurrency?: number
  onProgress?: (progress: { processed: number; total: number; slug: string; ok: boolean; error?: string }) => void
}

const now = () => new Date()

function syncConcurrency(value?: number): number {
  const parsed = value ?? Number(process.env.SYNC_CATALOG_CONCURRENCY || 3)
  if (!Number.isFinite(parsed)) return 3
  return Math.max(1, Math.min(10, Math.floor(parsed)))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function episodeNumber(title: string): number | null {
  const value = title.match(/episode\s*(\d+)/i)?.[1]
  return value ? Number(value) : null
}

function animeTitle(detail: AnimeDetail | null, fallback: string): string {
  return (detail?.title || fallback).trim()
}

function isCompletedStatus(value: string): boolean {
  return /complete|completed|finished|selesai/i.test(value)
}

async function startRun(type: SyncRunType) {
  const [run] = await getDb().insert(syncRuns).values({ type }).returning({ id: syncRuns.id })
  if (!run) throw new Error('Failed to create sync run')
  return run.id
}

async function finishRun(id: number, status: 'SUCCESS' | 'FAILED', stats: { processed: number; succeeded: number; failed: number; message?: string }) {
  await getDb().update(syncRuns).set({
    status,
    finishedAt: now(),
    processed: stats.processed,
    succeeded: stats.succeeded,
    failed: stats.failed,
    message: stats.message,
  }).where(eq(syncRuns.id, id))
}

async function upsertMalAnime(anime: JikanPersistedAnime) {
  await getDb().insert(malAnime).values({
    malId: anime.malId,
    title: anime.title,
    titleEnglish: anime.titleEnglish,
    titleJapanese: anime.titleJapanese,
    synopsis: anime.synopsis,
    background: anime.background,
    imageUrl: anime.imageUrl,
    trailerEmbedUrl: anime.trailerEmbedUrl,
    score: anime.score === null ? '' : String(anime.score),
    rank: anime.rank,
    popularity: anime.popularity,
    rating: anime.rating,
    season: anime.season,
    year: anime.year,
    type: anime.type,
    status: anime.status,
    episodes: anime.episodes,
    duration: anime.duration,
    studios: anime.studios,
    characters: anime.characters,
    updatedAt: now(),
  }).onConflictDoUpdate({
    target: malAnime.malId,
    set: {
      title: anime.title,
      titleEnglish: anime.titleEnglish,
      titleJapanese: anime.titleJapanese,
      synopsis: anime.synopsis,
      background: anime.background,
      imageUrl: anime.imageUrl,
      trailerEmbedUrl: anime.trailerEmbedUrl,
      score: anime.score === null ? '' : String(anime.score),
      rank: anime.rank,
      popularity: anime.popularity,
      rating: anime.rating,
      season: anime.season,
      year: anime.year,
      type: anime.type,
      status: anime.status,
      episodes: anime.episodes,
      duration: anime.duration,
      studios: anime.studios,
      characters: anime.characters,
      updatedAt: now(),
    },
  })
}

async function upsertGenres(animeSlug: string, anime: JikanPersistedAnime) {
  if (anime.genres.length > 0) {
    await getDb().insert(genres).values(anime.genres).onConflictDoNothing()
  }

  await getDb().delete(animeGenres).where(eq(animeGenres.animeSlug, animeSlug))

  if (anime.genres.length > 0) {
    await getDb().insert(animeGenres).values(anime.genres.map((genre) => ({
      animeSlug,
      genreSlug: genre.slug,
    }))).onConflictDoNothing()
  }
}

async function upsertEpisodes(animeSlug: string, episodes: AnimeDetail['episodes']) {
  if (episodes.length === 0) return

  await getDb().insert(animeEpisodes).values(episodes.map((episode, index) => ({
    slug: episode.slug,
    animeSlug,
    title: episode.title,
    date: episode.date,
    episodeNumber: episodeNumber(episode.title),
    sortOrder: index,
    updatedAt: now(),
  }))).onConflictDoUpdate({
    target: animeEpisodes.slug,
    set: {
      title: sql`excluded.title`,
      date: sql`excluded.date`,
      episodeNumber: sql`excluded.episode_number`,
      sortOrder: sql`excluded.sort_order`,
      updatedAt: now(),
    },
  })
}

async function markAnimeFailed(input: SyncAnimeInput, message: string) {
  const [existing] = await getDb().select({ syncStatus: otakudesuAnime.syncStatus }).from(otakudesuAnime).where(eq(otakudesuAnime.slug, input.slug)).limit(1)
  const syncStatus = existing?.syncStatus === 'SYNCED' ? 'SYNCED' : 'FAILED'

  await getDb().insert(otakudesuAnime).values({
    slug: input.slug,
    rawTitle: input.titleHint || input.slug,
    title: input.titleHint || input.slug,
    latestEpisode: input.latest?.episode || '',
    latestDay: input.latest?.day || '',
    latestDate: input.latest?.date || '',
    latestRating: input.latest?.rating || '',
    isOngoing: Boolean(input.isOngoing),
    isCompleted: Boolean(input.isCompleted),
    syncStatus,
    syncError: message,
    updatedAt: now(),
  }).onConflictDoUpdate({
    target: otakudesuAnime.slug,
    set: {
      latestEpisode: input.latest?.episode || '',
      latestDay: input.latest?.day || '',
      latestDate: input.latest?.date || '',
      latestRating: input.latest?.rating || '',
      isOngoing: Boolean(input.isOngoing),
      isCompleted: Boolean(input.isCompleted),
      syncStatus,
      syncError: message,
      updatedAt: now(),
    },
  })
}

async function upsertSyncedAnime(input: SyncAnimeInput, detail: AnimeDetail, mal: JikanPersistedAnime) {
  const sourceTitle = animeTitle(detail, input.titleHint || input.slug)
  const sourceStatus = detail.status || (input.isOngoing ? 'Ongoing' : input.isCompleted ? 'Completed' : '')
  const completed = input.isCompleted ?? isCompletedStatus(sourceStatus)
  const ongoing = input.isOngoing ?? !completed

  await upsertMalAnime(mal)

  await getDb().insert(otakudesuAnime).values({
    slug: input.slug,
    malId: mal.malId,
    rawTitle: sourceTitle,
    title: sourceTitle,
    japaneseTitle: detail.japanese,
    sourceSynopsis: detail.synopsis,
    sourceScore: detail.score,
    sourceProducer: detail.producer,
    sourceType: detail.type,
    sourceStatus,
    sourceTotalEpisode: detail.totalEpisode,
    sourceDuration: detail.duration,
    sourceReleaseDate: detail.releaseDate,
    sourceStudio: detail.studio,
    latestEpisode: input.latest?.episode || detail.episodes[0]?.title || '',
    latestDay: input.latest?.day || '',
    latestDate: input.latest?.date || detail.episodes[0]?.date || '',
    latestRating: input.latest?.rating || detail.score || '',
    isOngoing: ongoing,
    isCompleted: completed,
    syncStatus: 'SYNCED',
    syncError: null,
    lastSyncedAt: now(),
    updatedAt: now(),
  }).onConflictDoUpdate({
    target: otakudesuAnime.slug,
    set: {
      malId: mal.malId,
      rawTitle: sourceTitle,
      title: sourceTitle,
      japaneseTitle: detail.japanese,
      sourceSynopsis: detail.synopsis,
      sourceScore: detail.score,
      sourceProducer: detail.producer,
      sourceType: detail.type,
      sourceStatus,
      sourceTotalEpisode: detail.totalEpisode,
      sourceDuration: detail.duration,
      sourceReleaseDate: detail.releaseDate,
      sourceStudio: detail.studio,
      latestEpisode: input.latest?.episode || detail.episodes[0]?.title || '',
      latestDay: input.latest?.day || '',
      latestDate: input.latest?.date || detail.episodes[0]?.date || '',
      latestRating: input.latest?.rating || detail.score || '',
      isOngoing: ongoing,
      isCompleted: completed,
      syncStatus: 'SYNCED',
      syncError: null,
      lastSyncedAt: now(),
      updatedAt: now(),
    },
  })

  await upsertEpisodes(input.slug, detail.episodes)
  await upsertGenres(input.slug, mal)
}

export async function syncAnimeFromOtakudesu(input: SyncAnimeInput): Promise<SyncAnimeResult> {
  try {
    const detail = await scrapeAnimeDetailForSync(input.slug)
    if (!detail) throw new Error('Otakudesu detail not found')

    const title = animeTitle(detail, input.titleHint || input.slug)
    const mal = await fetchPersistedJikanAnime(title, detail.japanese || undefined)
    if (!mal) throw new Error(`MAL match not found for ${title}`)

    await upsertSyncedAnime(input, detail, mal)
    return { slug: input.slug, ok: true }
  } catch (error) {
    const message = errorMessage(error)
    await markAnimeFailed(input, message)
    return { slug: input.slug, ok: false, error: message }
  }
}

async function syncLatestOngoing() {
  const kind: LatestAnimeKind = 'ONGOING'
  const latest = await scrapeLatestAnime(kind, 1)
  const synced: { card: AnimeCard; position: number }[] = []
  const results: SyncAnimeResult[] = []

  for (const [index, card] of latest.anime.entries()) {
    const result = await syncAnimeFromOtakudesu({
      slug: card.slug,
      titleHint: card.title,
      isOngoing: true,
      isCompleted: false,
      latest: card,
    })
    results.push(result)
    if (result.ok) synced.push({ card, position: index })
  }

  if (synced.length > 0) {
    await getDb().delete(latestFeedItems).where(eq(latestFeedItems.kind, kind))
    await getDb().insert(latestFeedItems).values(synced.map(({ card, position }) => ({
      kind,
      animeSlug: card.slug,
      position,
      episode: card.episode,
      day: card.day,
      date: card.date,
      rating: card.rating || '',
      syncedAt: now(),
    }))).onConflictDoNothing()
  }

  return results
}

export async function syncLatestAnime() {
  const runId = await startRun('LATEST')
  const results: SyncAnimeResult[] = []

  try {
    results.push(...await syncLatestOngoing())
    const failed = results.filter((result) => !result.ok)
    await finishRun(runId, failed.length === results.length ? 'FAILED' : 'SUCCESS', {
      processed: results.length,
      succeeded: results.length - failed.length,
      failed: failed.length,
      message: failed.slice(0, 5).map((result) => `${result.slug}: ${result.error}`).join('\n') || undefined,
    })
    return { processed: results.length, succeeded: results.length - failed.length, failed: failed.length, failures: failed }
  } catch (error) {
    await finishRun(runId, 'FAILED', { processed: results.length, succeeded: results.filter((result) => result.ok).length, failed: results.filter((result) => !result.ok).length, message: errorMessage(error) })
    throw error
  }
}

async function shouldSkipCatalogItem(item: AnimeIndexItem, refresh: boolean): Promise<boolean> {
  const [existing] = await getDb().select({ syncStatus: otakudesuAnime.syncStatus }).from(otakudesuAnime).where(eq(otakudesuAnime.slug, item.slug)).limit(1)
  if (refresh) return false
  if (!item.isOngoing && existing) return true
  return existing?.syncStatus === 'SYNCED'
}

export async function syncCatalogAnime(options: SyncOptions = {}) {
  const runId = await startRun('CATALOG')
  let allItems: AnimeIndexItem[] = []
  let selected = 0
  const results: SyncAnimeResult[] = []

  try {
    allItems = await scrapeAnimeIndex()
    const items = allItems.slice(options.offset || 0, options.limit ? (options.offset || 0) + options.limit : undefined)
    selected = items.length

    const pending: AnimeIndexItem[] = []
    for (const item of items) {
      if (!await shouldSkipCatalogItem(item, Boolean(options.refresh))) pending.push(item)
    }

    let cursor = 0
    const worker = async () => {
      while (cursor < pending.length) {
        const item = pending[cursor++]
        if (!item) continue
        const result = await syncAnimeFromOtakudesu({
          slug: item.slug,
          titleHint: item.title,
          isOngoing: item.isOngoing,
          isCompleted: !item.isOngoing,
        })
        results.push(result)
        options.onProgress?.({ processed: results.length, total: pending.length, ...result })
      }
    }

    await Promise.all(Array.from({ length: syncConcurrency(options.concurrency) }, worker))

    const failed = results.filter((result) => !result.ok)
    await finishRun(runId, failed.length === results.length && results.length > 0 ? 'FAILED' : 'SUCCESS', {
      processed: results.length,
      succeeded: results.length - failed.length,
      failed: failed.length,
      message: failed.slice(0, 5).map((result) => `${result.slug}: ${result.error}`).join('\n') || undefined,
    })
    return { total: allItems.length, selected, processed: results.length, succeeded: results.length - failed.length, failed: failed.length, concurrency: syncConcurrency(options.concurrency), failures: failed }
  } catch (error) {
    await finishRun(runId, 'FAILED', { processed: results.length, succeeded: results.filter((result) => result.ok).length, failed: results.filter((result) => !result.ok).length, message: errorMessage(error) })
    throw error
  }
}

export async function syncMissingAnime(slugs: string[]) {
  if (slugs.length === 0) return []
  const existing = await getDb().select({ slug: otakudesuAnime.slug, syncStatus: otakudesuAnime.syncStatus }).from(otakudesuAnime).where(inArray(otakudesuAnime.slug, slugs))
  const synced = new Set(existing.filter((item) => item.syncStatus === 'SYNCED').map((item) => item.slug))
  const missing = slugs.filter((slug) => !synced.has(slug))
  const results: SyncAnimeResult[] = []
  for (const slug of missing) results.push(await syncAnimeFromOtakudesu({ slug }))
  return results
}

export type LatestSyncResult = Awaited<ReturnType<typeof syncLatestAnime>>

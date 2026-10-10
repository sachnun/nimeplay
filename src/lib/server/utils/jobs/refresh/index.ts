import { Cause, Effect } from 'effect'
import { eq } from 'drizzle-orm'
import type { AnimeSourceRow } from '../../../database/schema'
import { anime, animeSources } from '../../../database/schema'
import { db } from '../../db'
import { log, ok, warn } from '../../log'
import { getSources, splitSource } from '../../sources'
import { parseEpisodeDate } from '../../sources/shared'
import type { AniList } from '../../mal/anilist'
import type { Http } from '../../net/http'
import type { AnimeSource, ScrapedAnimeDetail } from '../../sources/types'
import { backfillCompleted, syncOngoingCatalog } from './catalog'
import { getSourceRow, refreshCanonicalMetadata, syncAnimeAggregate, upsertEpisodes } from './persist'
import { resolveSourceMetadata } from './resolve'
import { acquireSync, releaseSync } from './state'
import { episodeNumber } from './util'
import type { NetError } from '../../net/rate'

function normalizeStatus(raw: string): string {
  const value = raw.toLowerCase()
  if (value.includes('completed') || value.includes('finished')) return 'COMPLETED'
  return 'ONGOING'
}

async function ensureSourceRow(source: AnimeSource, vendorSlug: string): Promise<AnimeSourceRow | null> {
  const existing = await getSourceRow(source.id, vendorSlug)
  if (existing) return existing
  const [row] = await db()
    .insert(animeSources)
    .values({ source: source.id, slug: vendorSlug })
    .onConflictDoNothing()
    .returning()
  return row ?? (await getSourceRow(source.id, vendorSlug))
}

function latestEpisodeAt(episodes: ScrapedAnimeDetail['episodes']): Date | null {
  return episodes
    .map(entry => parseEpisodeDate(entry.date))
    .filter((date): date is Date => date !== null)
    .reduce<Date | null>((latest, date) => (!latest || date > latest ? date : latest), null)
}

function maxEpisodeNumber(episodes: ScrapedAnimeDetail['episodes']): number {
  return episodes.reduce((max, entry) => {
    const parsed = episodeNumber(entry.slug) ?? episodeNumber(entry.title)
    return parsed != null && parsed > max ? parsed : max
  }, 0)
}

async function applyDetail(
  source: AnimeSource,
  sourceRow: AnimeSourceRow,
  detail: ScrapedAnimeDetail | null,
): Promise<number> {
  if (!detail) {
    await db().update(animeSources).set({ updatedAt: new Date() }).where(eq(animeSources.id, sourceRow.id))
    return 0
  }
  const latest = latestEpisodeAt(detail.episodes)
  const maxEpisode = maxEpisodeNumber(detail.episodes)
  await upsertEpisodes(source, sourceRow.id, detail.episodes)
  await db()
    .update(animeSources)
    .set({
      status: normalizeStatus(detail.status),
      ...(latest ? { latestEpisodeAt: latest } : {}),
      updatedAt: new Date(),
    })
    .where(eq(animeSources.id, sourceRow.id))
  return maxEpisode
}

async function markNewEpisode(animeId: number, maxInDetail: number): Promise<void> {
  if (maxInDetail <= 0) return
  const [current] = await db()
    .select({ latestEpisode: anime.latestEpisode })
    .from(anime)
    .where(eq(anime.id, animeId))
    .limit(1)
  if (maxInDetail > (current?.latestEpisode ?? 0)) {
    await db().update(anime).set({ lastNewEpisodeAt: new Date() }).where(eq(anime.id, animeId))
  }
}

function syncLinked(
  source: AnimeSource,
  sourceRow: AnimeSourceRow,
  detail: ScrapedAnimeDetail | null,
  maxInDetail: number,
): Effect.Effect<void, never, AniList> {
  return Effect.gen(function* () {
    const linkedAnimeId = sourceRow.animeId
    if (!linkedAnimeId) {
      const animeId = yield* resolveSourceMetadata(sourceRow, source, detail)
      if (animeId) yield* Effect.promise(() => syncAnimeAggregate(animeId))
      return
    }
    if (!sourceRow.metadataSyncedAt) {
      yield* Effect.promise(() => refreshCanonicalMetadata(linkedAnimeId))
      yield* Effect.promise(() =>
        db().update(animeSources).set({ metadataSyncedAt: new Date() }).where(eq(animeSources.id, sourceRow.id)),
      )
    }
    yield* Effect.promise(() => markNewEpisode(linkedAnimeId, maxInDetail))
    yield* Effect.promise(() => syncAnimeAggregate(linkedAnimeId))
  })
}

export function refreshSourceBySlug(compositeSlug: string): Effect.Effect<void, NetError, Http | AniList> {
  return Effect.gen(function* () {
    const split = splitSource(compositeSlug)
    if (!split) return
    const sourceRow = yield* Effect.promise(() => ensureSourceRow(split.source, split.rest))
    if (!sourceRow) return

    const detail = yield* split.source.detailFresh(split.rest)
    const maxInDetail = yield* Effect.promise(() => applyDetail(split.source, sourceRow, detail))
    yield* syncLinked(split.source, sourceRow, detail, maxInDetail)

    yield* Effect.sync(() =>
      log(`[refresh] ${compositeSlug}`, {
        status: detail ? normalizeStatus(detail.status) : 'no-detail',
        episodes: detail?.episodes.length ?? 0,
        maxEpisode: maxInDetail,
      }),
    )
  })
}

export function runOngoingSync(): Effect.Effect<void, never, Http> {
  return Effect.gen(function* () {
    if (!(yield* acquireSync('catalog'))) return
    yield* syncOngoingCatalog().pipe(
      Effect.catchCause(cause =>
        Effect.sync(() => warn('[ongoing] sync failed', { error: Cause.pretty(cause).slice(0, 300) })),
      ),
      Effect.ensuring(releaseSync('catalog')),
    )
  })
}

export function runBackfill(sourceId: string): Effect.Effect<void, never, Http> {
  return Effect.gen(function* () {
    const source = getSources().find(item => item.id === sourceId)
    if (!source) return
    if (!(yield* acquireSync(`backfill:${sourceId}`))) return
    yield* backfillCompleted(source).pipe(
      Effect.tap(result =>
        result.registered > 0 ? Effect.sync(() => ok(`[backfill] ${sourceId}: +${result.registered}`)) : Effect.void,
      ),
      Effect.asVoid,
      Effect.catchCause(cause =>
        Effect.sync(() => warn(`[backfill] ${sourceId} failed`, { error: Cause.pretty(cause).slice(0, 300) })),
      ),
      Effect.ensuring(releaseSync(`backfill:${sourceId}`)),
    )
  })
}

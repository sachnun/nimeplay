import { eq } from 'drizzle-orm'
import type { AnimeSourceRow } from '../../../database/schema'
import { anime, animeSources } from '../../../database/schema'
import { db } from '../../db'
import { log, ok, warn } from '../../log'
import { getSources, splitSource } from '../../sources'
import { parseEpisodeDate } from '../../sources/shared'
import type { AnimeSource, ScrapedAnimeDetail } from '../../sources/types'
import { backfillCompleted, syncOngoingCatalog } from './catalog'
import { getSourceRow, refreshCanonicalMetadata, syncAnimeAggregate, upsertEpisodes } from './persist'
import { resolveSourceMetadata } from './resolve'
import { acquireSync, releaseSync } from './state'
import { episodeNumber } from './util'

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

async function syncLinked(
  source: AnimeSource,
  sourceRow: AnimeSourceRow,
  detail: ScrapedAnimeDetail | null,
  maxInDetail: number,
): Promise<void> {
  const linkedAnimeId = sourceRow.animeId
  if (!linkedAnimeId) {
    const animeId = await resolveSourceMetadata(sourceRow, source, detail)
    if (animeId) await syncAnimeAggregate(animeId)
    return
  }
  if (!sourceRow.metadataSyncedAt) {
    await refreshCanonicalMetadata(linkedAnimeId)
    await db().update(animeSources).set({ metadataSyncedAt: new Date() }).where(eq(animeSources.id, sourceRow.id))
  }
  await markNewEpisode(linkedAnimeId, maxInDetail)
  await syncAnimeAggregate(linkedAnimeId)
}

export async function refreshSourceBySlug(compositeSlug: string): Promise<void> {
  const split = splitSource(compositeSlug)
  if (!split) return
  const sourceRow = await ensureSourceRow(split.source, split.rest)
  if (!sourceRow) return

  const detail = await split.source.detailFresh(split.rest)
  const maxInDetail = await applyDetail(split.source, sourceRow, detail)
  await syncLinked(split.source, sourceRow, detail, maxInDetail)

  log(`[refresh] ${compositeSlug}`, {
    status: detail ? normalizeStatus(detail.status) : 'no-detail',
    episodes: detail?.episodes.length ?? 0,
    maxEpisode: maxInDetail,
  })
}

export async function runOngoingSync(): Promise<void> {
  if (!acquireSync('catalog')) return
  try {
    await syncOngoingCatalog()
  } catch (error) {
    warn('[ongoing] sync failed', { error: error instanceof Error ? error.message : String(error) })
  } finally {
    releaseSync('catalog')
  }
}

export async function runBackfill(sourceId: string): Promise<void> {
  const source = getSources().find(item => item.id === sourceId)
  if (!source) return
  if (!acquireSync(`backfill:${sourceId}`)) return
  try {
    const result = await backfillCompleted(source)
    if (result.registered > 0) ok(`[backfill] ${sourceId}: +${result.registered}`)
  } catch (error) {
    warn(`[backfill] ${sourceId} failed`, { error: error instanceof Error ? error.message : String(error) })
  } finally {
    releaseSync(`backfill:${sourceId}`)
  }
}

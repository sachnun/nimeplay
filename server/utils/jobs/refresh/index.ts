import { eq } from 'drizzle-orm'
import { anime, animeSources } from '../../../database/schema'
import { db } from '../../db'
import { getSources, splitSource } from '../../sources'
import { parseEpisodeDate } from '../../sources/shared'
import { backfillCompleted, syncOngoingCatalog } from './catalog'
import { getSourceRow, loadSourceMax, refreshCanonicalMetadata, syncAnimeAggregate, upsertEpisodes } from './persist'
import { resolveSourceMetadata } from './resolve'
import { acquireSync, releaseSync } from './state'
import { episodeNumber } from './util'
import { log, ok, warn } from '../../log'

function normalizeStatus(raw: string): string {
  const value = raw.toLowerCase()
  if (value.includes('completed') || value.includes('finished')) return 'COMPLETED'
  return 'ONGOING'
}

export async function refreshSourceBySlug(compositeSlug: string): Promise<void> {
  const split = splitSource(compositeSlug)
  if (!split) return
  const source = split.source
  const vendorSlug = split.rest

  let sourceRow = await getSourceRow(source.id, vendorSlug)
  if (!sourceRow) {
    const [row] = await db()
      .insert(animeSources)
      .values({ source: source.id, slug: vendorSlug, url: `${source.baseUrl}/anime/${vendorSlug}/` })
      .onConflictDoNothing()
      .returning()
    sourceRow = row ?? await getSourceRow(source.id, vendorSlug)
    if (!sourceRow) return
  }

  const detail = await source.detailFresh(vendorSlug)
  let hasNewEpisodes = false
  if (detail) {
    const status = normalizeStatus(detail.status)
    const latestEpisodeAt = detail.episodes
      .map(entry => parseEpisodeDate(entry.date))
      .filter((date): date is Date => date !== null)
      .reduce<Date | null>((latest, date) => (!latest || date > latest ? date : latest), null)
    const maxBefore = await loadSourceMax(sourceRow.id)
    const maxInDetail = detail.episodes.reduce((max, entry) => {
      const parsed = episodeNumber(entry.slug) ?? episodeNumber(entry.title)
      return parsed != null && parsed > max ? parsed : max
    }, 0)
    hasNewEpisodes = Math.max(maxBefore, maxInDetail) > maxBefore
    await upsertEpisodes(source, sourceRow.id, detail.episodes)
    await db().update(animeSources).set({
      status,
      ...(latestEpisodeAt ? { latestEpisodeAt } : {}),
      updatedAt: new Date(),
    }).where(eq(animeSources.id, sourceRow.id))
  }
  else {
    await db().update(animeSources).set({ updatedAt: new Date() }).where(eq(animeSources.id, sourceRow.id))
  }

  const linkedAnimeId = sourceRow.animeId
  if (linkedAnimeId) {
    if (!sourceRow.metadataSyncedAt) {
      await refreshCanonicalMetadata(linkedAnimeId)
      await db().update(animeSources).set({ metadataSyncedAt: new Date() }).where(eq(animeSources.id, sourceRow.id))
    }
    if (hasNewEpisodes) {
      await db().update(anime).set({ lastNewEpisodeAt: new Date() }).where(eq(anime.id, linkedAnimeId))
    }
    await syncAnimeAggregate(linkedAnimeId)
  }
  else {
    const animeId = await resolveSourceMetadata(sourceRow, source, detail)
    if (animeId) await syncAnimeAggregate(animeId)
  }

  log(`[refresh] ${compositeSlug}`, {
    status: detail ? normalizeStatus(detail.status) : 'no-detail',
    episodes: detail?.episodes.length ?? 0,
    new: hasNewEpisodes,
  })
}

export async function runOngoingSync(): Promise<void> {
  if (!acquireSync('catalog')) return
  try {
    await syncOngoingCatalog()
  }
  catch (error) {
    warn('[ongoing] sync failed', { error: error instanceof Error ? error.message : String(error) })
  }
  finally {
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
  }
  catch (error) {
    warn(`[backfill] ${sourceId} failed`, { error: error instanceof Error ? error.message : String(error) })
  }
  finally {
    releaseSync(`backfill:${sourceId}`)
  }
}

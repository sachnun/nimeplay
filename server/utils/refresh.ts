import type { H3Event } from 'h3'
import { eq, sql } from 'drizzle-orm'
import { db } from './db'
import { anime } from '../database/schema'
import { refreshAnimeBySlug, runScrape } from './scrape-run'

const CATALOG_REFRESH_MS = Number(process.env.REFRESH_CATALOG_MS || 15 * 60 * 1000)
const DETAIL_REFRESH_MS = Number(process.env.REFRESH_DETAIL_MS || 6 * 60 * 60 * 1000)
const METADATA_REFRESH_MS = 7 * 24 * 60 * 60 * 1000

let lastCatalogRefresh = 0
let catalogRunning = false
const animeRunning = new Map<number, boolean>()

function waitUntil(event: H3Event, promise: Promise<unknown>): void {
  const withWaitUntil = event as H3Event & { waitUntil?: (p: Promise<unknown>) => void }
  if (withWaitUntil.waitUntil) {
    withWaitUntil.waitUntil(promise)
    return
  }
  promise.catch(() => {})
}

/**
 * Background refresh of the catalog (ongoing/completed pages + missing MAL
 * metadata). Throttled and locked so home traffic never blocks on scraping.
 */
export function scheduleCatalogRefresh(event: H3Event): void {
  const now = Date.now()
  if (catalogRunning || now - lastCatalogRefresh < CATALOG_REFRESH_MS) return
  lastCatalogRefresh = now
  catalogRunning = true
  const task = runScrape({ mode: 'cron' })
    .catch(error => console.warn('[refresh] catalog failed:', error instanceof Error ? error.message : error))
    .finally(() => { catalogRunning = false })
  waitUntil(event, task)
}

/**
 * Background refresh of a single anime's episode list and (when stale) its
 * MyAnimeList metadata. Resolves the slug from the MAL id before scraping.
 */
export function scheduleAnimeRefresh(event: H3Event, malId: number): void {
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
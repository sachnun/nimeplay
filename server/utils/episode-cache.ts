import { and, eq } from 'drizzle-orm'
import { db } from './db'
import { episodes } from '../database/schema'
import { enqueue } from './queue'
import { getSources, scrapeEpisode, splitSource } from './sources'
import type { EpisodeData } from './sources/types'

export function isWorkerBlocked(slug: string): boolean {
  return splitSource(slug)?.source.workerBlocked === true
}

export function blockedSourceIds(): string[] {
  return getSources().filter(source => source.workerBlocked).map(source => source.id)
}

export async function getEpisodeData(animeId: number, number: number): Promise<EpisodeData | null> {
  const [row] = await db()
    .select({ cache: episodes.cache })
    .from(episodes)
    .where(and(eq(episodes.animeId, animeId), eq(episodes.number, number)))
    .limit(1)
  return row?.cache ?? null
}

export async function putEpisodeData(slug: string, data: EpisodeData): Promise<void> {
  await db().update(episodes).set({ cache: data, cachedAt: new Date() }).where(eq(episodes.slug, slug))
}

export async function cacheEpisodeData(slug: string): Promise<void> {
  const data = await scrapeEpisode(slug)
  if (!data) throw new Error(`episode data unavailable: ${slug}`)
  await putEpisodeData(slug, data)
}

export async function loadEpisodeData(slug: string, animeId: number, number: number): Promise<EpisodeData | null> {
  const cached = await getEpisodeData(animeId, number)
  if (cached) return cached
  if (isWorkerBlocked(slug)) {
    await enqueue({
      type: 'episode.cache',
      payload: { slug },
      dedupeKey: `episode.cache:${slug}`,
      priority: 2,
    }).catch(() => {})
    return null
  }
  const scraped = await scrapeEpisode(slug)
  if (scraped) await putEpisodeData(slug, scraped).catch(() => {})
  return scraped
}

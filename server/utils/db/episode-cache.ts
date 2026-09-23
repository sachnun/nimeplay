import { eq } from 'drizzle-orm'
import { db } from './index'
import { episodes } from '../../database/schema'
import { enqueue } from '../jobs/queue'
import { getSources, scrapeEpisode, splitSource } from '../sources'
import type { EpisodeData } from '../sources/types'

export function isWorkerBlocked(slug: string): boolean {
  return splitSource(slug)?.source.workerBlocked === true
}

export function blockedSourceIds(): string[] {
  return getSources().filter(source => source.workerBlocked).map(source => source.id)
}

export async function getEpisodeData(slug: string): Promise<EpisodeData | null> {
  const [row] = await db()
    .select({ cache: episodes.cache })
    .from(episodes)
    .where(eq(episodes.slug, slug))
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

export async function loadEpisodeData(candidates: string[]): Promise<EpisodeData | null> {
  for (const slug of candidates) {
    const cached = await getEpisodeData(slug)
    if (cached && cached.mirrors.length > 0) return cached
  }

  let fallback: EpisodeData | null = null
  for (const slug of candidates) {
    if (isWorkerBlocked(slug)) {
      await enqueue({
        type: 'episode.cache',
        payload: { slug },
        dedupeKey: `episode.cache:${slug}`,
        priority: 2,
      }).catch(() => {})
      continue
    }
    const scraped = await scrapeEpisode(slug).catch(() => null)
    if (!scraped) continue
    fallback ??= scraped
    if (scraped.mirrors.length === 0) continue
    await putEpisodeData(slug, scraped).catch(() => {})
    return scraped
  }
  return fallback
}

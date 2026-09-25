import { eq } from 'drizzle-orm'
import { db } from './index'
import { episodes } from '../../database/schema'
import { scrapeEpisode } from '../sources'
import type { EpisodeData } from '../sources/types'

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

export async function loadEpisodeData(candidates: string[]): Promise<EpisodeData | null> {
  let fallback: EpisodeData | null = null
  for (const slug of candidates) {
    const cached = await getEpisodeData(slug)
    if (cached && cached.mirrors.length > 0) return cached

    const scraped = await scrapeEpisode(slug).catch(() => null)
    if (!scraped) continue
    fallback ??= scraped
    if (scraped.mirrors.length === 0) continue
    await putEpisodeData(slug, scraped).catch(() => {})
    return scraped
  }
  return fallback
}

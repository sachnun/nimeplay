import { cache } from '../cache'
import { animein } from './animein'
import { otakudesu } from './otakudesu'
import { sokuja } from './sokuja'
import { ylnime } from './ylnime'
import type { AnimeSource, EpisodeData, ScrapedAnimeDetail } from './types'

const EPISODE_TTL = 30 * 60 * 1000
const MIRROR_TTL = 10 * 60 * 1000

export const sources: Record<string, AnimeSource> = {
  animein,
  otakudesu,
  sokuja,
  ylnime,
}

export function getSources(): AnimeSource[] {
  return Object.values(sources)
}

export function splitSource(slug: string): { source: AnimeSource, rest: string } | null {
  const index = slug.indexOf(':')
  if (index <= 0) return null
  const source = sources[slug.slice(0, index)]
  const rest = slug.slice(index + 1)
  if (!source || !rest) return null
  return { source, rest }
}

export function scrapeAnimeDetailFresh(slug: string): Promise<ScrapedAnimeDetail | null> {
  const split = splitSource(slug)
  if (!split) return Promise.resolve(null)
  return split.source.detailFresh(split.rest)
}

export function scrapeEpisode(slug: string): Promise<EpisodeData | null> {
  const split = splitSource(slug)
  if (!split) return Promise.resolve(null)
  return cache.get('episode', slug, EPISODE_TTL, () => {
    return split.source.episodeFresh(split.rest)
  }) as Promise<EpisodeData | null>
}

export function invalidateEpisodeCache(slug: string): void {
  cache.delete('episode', slug)
}

export function scrapeEpisodeFresh(slug: string): Promise<EpisodeData | null> {
  invalidateEpisodeCache(slug)
  return scrapeEpisode(slug)
}

export function resolvemirror(dataContent: string): Promise<string | null> {
  const split = splitSource(dataContent)
  if (!split) return Promise.resolve(null)
  return cache.get('mirror', dataContent, MIRROR_TTL, () => {
    return split.source.resolveMirror(split.rest)
  }) as Promise<string | null>
}
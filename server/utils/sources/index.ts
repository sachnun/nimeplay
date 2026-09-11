import type { H3Event } from 'h3'
import { cache } from '../cache'
import { animein } from './animein'
import { otakudesu } from './otakudesu'
import { ylnime } from './ylnime'
import { gomunime } from './gomunime'
import type { AnimeSource, EpisodeData, ScrapedAnimeDetail } from './types'

const EPISODE_TTL = 30 * 60 * 1000
const MIRROR_TTL = 10 * 60 * 1000

export const sources: Record<string, AnimeSource> = {
  animein,
  otakudesu,
  ylnime,
  gomunime,
}

export function getSources(): AnimeSource[] {
  return Object.values(sources)
}

export function splitSource(slug: string): { source: AnimeSource; rest: string } {
  const index = slug.indexOf(':')
  const source = index === -1 ? null : sources[slug.slice(0, index)]
  if (!source) return { source: otakudesu, rest: slug }
  return { source, rest: slug.slice(index + 1) }
}

export function scrapeAnimeDetailFresh(slug: string): Promise<ScrapedAnimeDetail | null> {
  const { source, rest } = splitSource(slug)
  return source.detailFresh(rest)
}

export function scrapeEpisode(slug: string, event?: H3Event): Promise<EpisodeData | null> {
  return cache.get('episode', slug, EPISODE_TTL, () => {
    const { source, rest } = splitSource(slug)
    return source.episodeFresh(rest)
  }, event ? { event } : undefined) as Promise<EpisodeData | null>
}

export function invalidateEpisodeCache(slug: string): void {
  cache.delete('episode', slug)
}

export function scrapeEpisodeFresh(slug: string, event?: H3Event): Promise<EpisodeData | null> {
  invalidateEpisodeCache(slug)
  return scrapeEpisode(slug, event)
}

export function resolvemirror(dataContent: string, event?: H3Event): Promise<string | null> {
  return cache.get('mirror', dataContent, MIRROR_TTL, () => {
    const { source, rest } = splitSource(dataContent)
    return source.resolveMirror(rest)
  }, event ? { event } : undefined) as Promise<string | null>
}
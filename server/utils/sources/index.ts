import { animein } from './animein'
import { otakudesu } from './otakudesu'
import { sokuja } from './sokuja'
import { ylnime } from './ylnime'
import type { AnimeSource, EpisodeData, ScrapedAnimeDetail } from './types'

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
  return split.source.episodeFresh(split.rest)
}

export function resolvemirror(dataContent: string): Promise<string | null> {
  const split = splitSource(dataContent)
  if (!split) return Promise.resolve(null)
  return split.source.resolveMirror(split.rest)
}
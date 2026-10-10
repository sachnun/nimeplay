import { Effect } from 'effect'
import { animein } from './animein'
import { animexnonton } from './animexnonton'
import { astronime } from './astronime'
import { nakanime } from './nakanime'
import { otakudesu } from './otakudesu'
import { sokuja } from './sokuja'
import type { AnimeSource, EpisodeData, ScrapedAnimeDetail, SourceEffect } from './types'
import { ylnime } from './ylnime'

const sources: Record<string, AnimeSource> = {
  animein,
  animexnonton,
  astronime,
  nakanime,
  otakudesu,
  sokuja,
  ylnime,
}

const SOURCE_ORDER = ['otakudesu', 'ylnime', 'sokuja', 'animein', 'animexnonton', 'nakanime', 'astronime']

export function sourceRank(id: string): number {
  const index = SOURCE_ORDER.indexOf(id)
  return index === -1 ? SOURCE_ORDER.length : index
}

export function getSources(): AnimeSource[] {
  return Object.values(sources)
}

export function splitSource(slug: string): { source: AnimeSource; rest: string } | null {
  const index = slug.indexOf(':')
  if (index <= 0) return null
  const source = sources[slug.slice(0, index)]
  const rest = slug.slice(index + 1)
  if (!source || !rest) return null
  return { source, rest }
}

export function scrapeAnimeDetailFresh(slug: string): SourceEffect<ScrapedAnimeDetail | null> {
  const split = splitSource(slug)
  if (!split) return Effect.succeed(null)
  return split.source.detailFresh(split.rest)
}

export function scrapeEpisode(slug: string): SourceEffect<EpisodeData | null> {
  const split = splitSource(slug)
  if (!split) return Effect.succeed(null)
  return split.source.episodeFresh(split.rest)
}

export function resolvemirror(dataContent: string): SourceEffect<string | null> {
  const split = splitSource(dataContent)
  if (!split) return Effect.succeed(null)
  return split.source.resolveMirror(split.rest)
}

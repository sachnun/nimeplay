import type { Effect } from 'effect'
import type { Http } from '../net/http'
import type { NetError } from '../net/rate'

export type SourceEffect<A> = Effect.Effect<A, NetError, Http>

export interface ScrapedAnimeCard {
  slug: string
  date: string
  status?: 'ONGOING' | 'COMPLETED'
}

export interface ScrapedAnimeDetail {
  title: string
  japanese: string
  status: string
  releaseDate: string
  episodes: { title: string; slug: string; date: string }[]
}

export interface EpisodeData {
  title: string
  animeSlug: string
  animeTitle: string
  mirrors: {
    quality: string
    sources: { name: string; dataContent: string }[]
  }[]
  episodeNav: { title: string; slug: string }[]
  thumbnail: string
}

export interface ListResult {
  anime: ScrapedAnimeCard[]
  totalPages: number
}

export interface AnimeSource {
  id: string
  name: string
  baseUrl: string
  ongoingFresh(page: number): SourceEffect<ListResult>
  completedFresh(page: number): SourceEffect<ListResult>
  detailFresh(slug: string): SourceEffect<ScrapedAnimeDetail | null>
  episodeFresh(slug: string): SourceEffect<EpisodeData | null>
  resolveMirror(opaque: string): SourceEffect<string | null>
  proxy?(url: string): Effect.Effect<{ headers?: Record<string, string> } | null, never, Http>
}

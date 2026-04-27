import type { TrpcOutputs } from '~/types/trpc'

export type AnimeCard = TrpcOutputs['animePage']['anime'][number]
export type AnimeDetail = NonNullable<TrpcOutputs['anime']>
export type EpisodeData = NonNullable<TrpcOutputs['episode']>
export type SearchResult = TrpcOutputs['search'][number]
export type Genre = TrpcOutputs['genres'][number]
export type GenreAnimeCard = TrpcOutputs['genre']['anime'][number]

export interface ContinueItem {
  animeSlug: string
  episodeNum: string
  episodeSlug: string
  currentTime: number
  duration: number
  title: string
  thumbnail: string
  latestEpisode: string
}

export interface OtakudesuInfo {
  score: string
  status: string
  type: string
  totalEpisode: string
  duration: string
  studio: string
  releaseDate: string
}

export type JikanAnimeData = NonNullable<TrpcOutputs['jikanAnime']>
export type JikanCharacter = JikanAnimeData['characters'][number]
export type SkipTime = TrpcOutputs['skipTimes'][number]
export type SkipInterval = SkipTime['interval']

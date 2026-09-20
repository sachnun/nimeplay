export type { AnimeCard, AnimeCharacter, AnimeDetail, Genre, GenreAnimeCard, SearchResult } from '#shared/types'

export interface EpisodeData {
  title: string
  mirrors: {
    quality: string
    sources: { name: string; dataContent: string }[]
  }[]
  thumbnail: string
}

export interface EpisodeMetaData {
  anime: { malId: number; title: string; thumbnail: string }
  episodeNumber: number
  episodeTitle: string
  episodes: number[]
}

export interface EpisodePageData {
  anime: { malId: number; title: string; thumbnail: string }
  episodeNumber: number
  episode: EpisodeData
  episodes: number[]
}

interface SkipInterval {
  startTime: number
  endTime: number
}

export interface SkipTime {
  interval: SkipInterval
  skipType: 'op' | 'ed' | 'mixed-op' | 'mixed-ed' | 'recap'
  skipId: string
  episodeLength: number
}

export interface OtakudesuInfo {
  score: string
  status: string
  type: string
  duration: string
  studio: string
  source: string
  releaseDate: string
}

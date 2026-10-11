export type { AnimeCard, AnimeCharacter, AnimeDetail, Genre, GenreAnimeCard, SearchResult } from '#lib/shared/types'

export interface EpisodeSource {
  server: string
  quality: string
}

export interface EpisodeStream {
  playUrl: string
  kind: 'hls' | 'file'
  quality: string
  server: string
}

export interface EpisodeMeta {
  title: string
  thumbnail: string
  sources: EpisodeSource[]
}

export interface EpisodeInfo {
  anime: { malId: number; title: string; thumbnail: string }
  episodeNumber: number
  episode: EpisodeMeta
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
  releaseDate: string
}

export interface PageData<T> {
  anime: T[]
  totalPages: number
}

export interface AnimeSummary {
  malId: number
  title: string
  thumbnail: string
}

export interface EpisodeResponse {
  anime: { malId: number; title: string; thumbnail: string }
  episodeNumber: number
  title: string
  thumbnail: string
  episodes: number[]
  servers: EpisodeSource[]
  stream: EpisodeStream | null
}

export type WatchProgressStatus = 'unstarted' | 'in_progress' | 'completed'

export interface WatchProgress {
  currentTime: number
  duration: number
  updatedAt: number
  malId: number
  episodeNumber: number
  latestEpisode?: number
}

export interface MirrorCandidate {
  server: string
  quality: string
}

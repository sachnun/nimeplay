export interface AnimeCard {
  malId: number
  title: string
  thumbnail: string
  episode: string
  day: string
  date: string
  rating?: string
}

export interface AnimeDetail {
  malId: number
  title: string
  japanese: string
  score: string
  producer: string
  type: string
  status: string
  totalEpisode: string
  duration: string
  releaseDate: string
  studio: string
  genres: { name: string; slug: string }[]
  thumbnail: string
  synopsis: string
  season?: string
  episodes: { number: number; date: string }[]
}

export interface EpisodeData {
  title: string
  defaultIframeSrc: string
  mirrors: {
    quality: string
    sources: { name: string; dataContent: string }[]
  }[]
  thumbnail: string
}

export interface EpisodePageData {
  anime: { malId: number; title: string; thumbnail: string }
  episodeNumber: number
  episode: EpisodeData
  episodes: number[]
}

export interface SearchResult {
  malId: number
  title: string
  thumbnail: string
  genres: string
  status: string
  rating: string
}

export interface Genre {
  name: string
  slug: string
}

export interface GenreAnimeCard {
  malId: number
  title: string
  thumbnail: string
  studio: string
  episodes: string
  rating: string
  genres: string
  date: string
}

export interface AnimeCharacter {
  name: string
  imageUrl: string
  role: 'Main' | 'Supporting'
  voiceActor?: { name: string; imageUrl: string }
}

export interface AnimeMetadata {
  malId: number
  synopsisEn: string
  background: string
  malScore: number | null
  malRank: number | null
  popularity: number | null
  rating: string
  season: string | null
  year: number | null
  trailerEmbedUrl: string | null
  characters: AnimeCharacter[]
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

export interface ContinueItem {
  malId: number
  episodeNum: string
  episodeNumber: number
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

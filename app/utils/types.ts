export interface AnimeCard {
  title: string
  slug: string
  thumbnail: string
  episode: string
  day: string
  date: string
  rating?: string
}

export interface AnimeDetail {
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
  episodes: { title: string; slug: string; date: string }[]
}

export interface EpisodeData {
  title: string
  animeSlug: string
  animeTitle: string
  defaultIframeSrc: string
  mirrors: {
    quality: string
    sources: { name: string; dataContent: string }[]
  }[]
  episodeNav: { title: string; slug: string }[]
  thumbnail: string
}

export interface SearchResult {
  title: string
  slug: string
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
  title: string
  slug: string
  thumbnail: string
  studio: string
  episodes: string
  rating: string
  genres: string
  date: string
}

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

export interface JikanCharacter {
  name: string
  imageUrl: string
  role: 'Main' | 'Supporting'
  voiceActor?: { name: string; imageUrl: string }
}

export interface JikanAnimeData {
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
  characters: JikanCharacter[]
}

export interface SkipInterval {
  startTime: number
  endTime: number
}

export interface SkipTime {
  interval: SkipInterval
  skipType: 'op' | 'ed' | 'mixed-op' | 'mixed-ed' | 'recap'
  skipId: string
  episodeLength: number
}

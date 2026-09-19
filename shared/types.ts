export interface Genre {
  name: string
  slug: string
}

export interface AnimeCard {
  malId: number
  title: string
  thumbnail: string
  episode: string
  day: string
  date: string
  rating?: string
}

export interface SearchResult {
  malId: number
  title: string
  thumbnail: string
  genres: string
  status: string
  rating: string
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
  source: string
  genres: Genre[]
  thumbnail: string
  synopsis: string
  season?: string
  episodes: { number: number; date: string }[]
}

export interface AnimeCharacter {
  name: string
  imageUrl: string
  role: 'Main' | 'Supporting'
  voiceActor?: { name: string; imageUrl: string }
}

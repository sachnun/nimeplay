export interface ScrapedAnimeCard {
  title: string
  slug: string
  thumbnail: string
  episode: string
  day: string
  date: string
  rating?: string
}

export interface ScrapedAnimeDetail {
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

export interface ListResult {
  anime: ScrapedAnimeCard[]
  totalPages: number
}

export interface AnimeSource {
  id: string
  name: string
  baseUrl: string
  /** Lower wins when two sources match the same MyAnimeList entry. */
  priority: number
  ongoingFresh(page: number): Promise<ListResult>
  completedFresh(page: number): Promise<ListResult>
  detailFresh(slug: string): Promise<ScrapedAnimeDetail | null>
  episodeFresh(slug: string): Promise<EpisodeData | null>
  resolveMirror(opaque: string): Promise<string | null>
}
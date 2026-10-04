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
  ongoingFresh(page: number): Promise<ListResult>
  completedFresh(page: number): Promise<ListResult>
  detailFresh(slug: string): Promise<ScrapedAnimeDetail | null>
  episodeFresh(slug: string): Promise<EpisodeData | null>
  resolveMirror(opaque: string): Promise<string | null>
  proxy?(url: string): Promise<{ headers?: Record<string, string> } | null>
}

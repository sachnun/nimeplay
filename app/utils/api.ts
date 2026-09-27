import type {
  AnimeCard,
  AnimeDetail,
  EpisodePageData,
  EpisodeStream,
  Genre,
  GenreAnimeCard,
  SearchResult,
} from '~/types'

const BASE = '/api/v1'

interface ListResponse<T> {
  data: T[]
  page: number
  totalPages: number
}

export interface PageData<T> {
  anime: T[]
  totalPages: number
}

export interface HomeData {
  ongoingData: PageData<AnimeCard>
  completedData: PageData<AnimeCard>
  genres: Genre[]
}

export interface EpisodeResponse {
  anime: { malId: number; title: string; thumbnail: string }
  episodeNumber: number
  title: string
  thumbnail: string
  episodes: number[]
  servers: { server: string; quality: string }[]
  stream: EpisodeStream | null
}

function asPage<T>(response: ListResponse<T>): PageData<T> {
  return { anime: response.data, totalPages: response.totalPages }
}

export function fetchHome(): Promise<HomeData> {
  return Promise.all([
    $fetch<ListResponse<AnimeCard>>(`${BASE}/anime`, { query: { type: 'ongoing' } }),
    $fetch<ListResponse<AnimeCard>>(`${BASE}/anime`, { query: { type: 'completed' } }),
    $fetch<{ data: Genre[] }>(`${BASE}/genres`),
  ]).then(([ongoing, completed, genres]) => ({
    ongoingData: asPage(ongoing),
    completedData: asPage(completed),
    genres: genres.data,
  }))
}

export function fetchAnimePage(type: 'ONGOING' | 'COMPLETED', page: number): Promise<PageData<AnimeCard>> {
  return $fetch<ListResponse<AnimeCard>>(`${BASE}/anime`, { query: { type, page } }).then(asPage)
}

export function fetchGenrePage(slug: string, page: number): Promise<PageData<GenreAnimeCard>> {
  return $fetch<ListResponse<GenreAnimeCard>>(`${BASE}/genre/${slug}`, { query: { page } }).then(asPage)
}

export function fetchGenres(): Promise<Genre[]> {
  return $fetch<{ data: Genre[] }>(`${BASE}/genres`).then((response) => response.data)
}

export function fetchSearch(query: string): Promise<SearchResult[]> {
  return $fetch<ListResponse<SearchResult>>(`${BASE}/anime`, { query: { q: query } }).then((response) => response.data)
}

export function fetchAnimeDetail(malId: number): Promise<AnimeDetail> {
  return $fetch<AnimeDetail>(`${BASE}/anime/${malId}`)
}

export interface EpisodePick {
  server?: string
  quality?: string
  stream?: boolean
}

export function fetchEpisode(malId: number, episode: number, pick: EpisodePick = {}): Promise<EpisodeResponse> {
  const query: Record<string, string | number> = {}
  if (pick.server) query.server = pick.server
  if (pick.quality) query.quality = pick.quality
  if (pick.stream === false) query.stream = 0
  const hasQuery = Object.keys(query).length > 0
  return $fetch<EpisodeResponse>(`${BASE}/anime/${malId}/${episode}`, { query: hasQuery ? query : undefined })
}

export function toEpisodePageData(response: EpisodeResponse): EpisodePageData {
  return {
    anime: response.anime,
    episodeNumber: response.episodeNumber,
    episode: {
      title: response.title,
      thumbnail: response.thumbnail,
      sources: response.servers,
      stream: response.stream,
    },
    episodes: response.episodes,
  }
}

export function fetchEpisodePage(malId: number, episode: number): Promise<EpisodePageData> {
  return fetchEpisode(malId, episode).then(toEpisodePageData)
}

export type { AnimeCard, AnimeCharacter, AnimeDetail, EpisodeSource, EpisodeStream, Genre, GenreAnimeCard, SearchResult } from '#lib/types'
import type {
  AnimeCard,
  AnimeDetail,
  EpisodePageData,
  EpisodeResponse,
  Genre,
  GenreAnimeCard,
  HomeData,
  PageData,
  SearchResult,
} from '#lib/types'

const BASE = '/api/v1'

type FetchLike = typeof fetch

interface ListResponse<T> {
  data: T[]
  page: number
  totalPages: number
}

function asPage<T>(response: ListResponse<T>): PageData<T> {
  return { anime: response.data, totalPages: response.totalPages }
}

async function getJson<T>(fetchFn: FetchLike, url: string): Promise<T> {
  const response = await fetchFn(url)
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return (await response.json()) as T
}

export function fetchHome(fetchFn: FetchLike): Promise<HomeData> {
  return Promise.all([
    getJson<ListResponse<AnimeCard>>(fetchFn, `${BASE}/anime?type=ongoing`),
    getJson<ListResponse<AnimeCard>>(fetchFn, `${BASE}/anime?type=completed`),
    getJson<{ data: Genre[] }>(fetchFn, `${BASE}/genres`),
  ]).then(([ongoing, completed, genres]) => ({
    ongoingData: asPage(ongoing),
    completedData: asPage(completed),
    genres: genres.data,
  }))
}

export function fetchAnimePage(
  fetchFn: FetchLike,
  type: 'ONGOING' | 'COMPLETED',
  page: number,
): Promise<PageData<AnimeCard>> {
  return getJson<ListResponse<AnimeCard>>(fetchFn, `${BASE}/anime?type=${type.toLowerCase()}&page=${page}`).then(asPage)
}

export function fetchGenrePage(
  fetchFn: FetchLike,
  slug: string,
  page: number,
): Promise<PageData<GenreAnimeCard>> {
  return getJson<ListResponse<GenreAnimeCard>>(
    fetchFn,
    `${BASE}/genre/${encodeURIComponent(slug)}?page=${page}`,
  ).then(asPage)
}

export function fetchGenres(fetchFn: FetchLike): Promise<Genre[]> {
  return getJson<{ data: Genre[] }>(fetchFn, `${BASE}/genres`).then(response => response.data)
}

export function fetchSearch(fetchFn: FetchLike, query: string): Promise<SearchResult[]> {
  return getJson<ListResponse<SearchResult>>(fetchFn, `${BASE}/anime?q=${encodeURIComponent(query)}`).then(
    response => response.data,
  )
}

export function fetchAnimeDetail(fetchFn: FetchLike, malId: number): Promise<AnimeDetail> {
  return getJson<AnimeDetail>(fetchFn, `${BASE}/anime/${malId}`)
}

interface EpisodePick {
  server?: string
  quality?: string
  stream?: boolean
}

export function fetchEpisode(
  fetchFn: FetchLike,
  malId: number,
  episode: number,
  pick: EpisodePick = {},
): Promise<EpisodeResponse> {
  const params = new URLSearchParams()
  if (pick.server) params.set('server', pick.server)
  if (pick.quality) params.set('quality', pick.quality)
  if (pick.stream === false) params.set('stream', '0')
  const query = params.toString()
  return getJson<EpisodeResponse>(fetchFn, `${BASE}/anime/${malId}/${episode}${query ? `?${query}` : ''}`)
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

export function fetchEpisodePage(
  fetchFn: FetchLike,
  malId: number,
  episode: number,
  pick: EpisodePick = {},
): Promise<EpisodePageData> {
  return fetchEpisode(fetchFn, malId, episode, pick).then(toEpisodePageData)
}


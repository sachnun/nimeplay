import { sealStreamToken } from '../streamUrl'
import type { AnimeSource, EpisodeData, ListResult, ScrapedAnimeCard, ScrapedAnimeDetail } from './types'

const PROXY_URL = 'https://animeinweb.com/api/proxy'
const PROXY_SECRET = 'animein-secure-proxy-key-123'
const ASSET_BASE = 'https://xyz-api.animein.net'
const REQUEST_TIMEOUT_MS = 8000
const COMPLETED_PAGE_LIMIT = 100
const EPISODE_PAGE_SIZE = 30
const EPISODE_LIST_MAX_PAGES = 45
const EPISODE_FETCH_BATCH = 6
const LATEST_EPISODE_CONCURRENCY = 8
const DAY_BY_INDEX = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU']
const DAY_LABEL: Record<string, string> = {
  SENIN: 'Senin',
  SELASA: 'Selasa',
  RABU: 'Rabu',
  KAMIS: 'Kamis',
  JUMAT: 'Jumat',
  SABTU: 'Sabtu',
  MINGGU: 'Minggu',
}

interface AnimeinMovie {
  id: string
  title: string
  synopsis?: string
  synonyms?: string
  image_poster?: string
  image_cover?: string
  type?: string
  year?: string
  day?: string
  status?: string
  studio?: string
  aired_start?: string
  genre?: string
}

interface AnimeinEpisode {
  id: string
  index: string
  title?: string
  id_movie?: string
  key_time?: string
  image?: string
}

interface AnimeinServer {
  id: string
  link: string
  quality: string
  name?: string
  type?: string
}

async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${PROXY_URL}${path}`, {
      headers: {
        'x-proxy-secret': PROXY_SECRET,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = await res.json() as { status?: number, error?: boolean, data?: T }
    if (body.error || body.status !== 200 || !body.data) return null
    return body.data
  }
  catch {
    return null
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await run(items[index]!)
    }
  })
  await Promise.all(workers)
  return results
}

function wibDay(): string {
  const index = new Date(Date.now() + 7 * 3600 * 1000).getUTCDay()
  return DAY_BY_INDEX[index] ?? 'MINGGU'
}

function absoluteAsset(value: string | undefined): string {
  if (!value) return ''
  if (value.startsWith('http')) return value
  return `${ASSET_BASE}${value.startsWith('/') ? value : `/${value}`}`
}

function parseGenres(raw: string | undefined): { name: string, slug: string }[] {
  if (!raw) return []
  return raw.split(',').map(name => name.trim()).filter(Boolean).map(name => ({
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
  }))
}

function episodeSlug(movieId: string, index: string, episodeId: string): string {
  return `${movieId}-episode-${index}-${episodeId}`
}

async function fetchEpisodePage(movieId: string, page: number): Promise<AnimeinEpisode[]> {
  const data = await apiGet<{ episode?: AnimeinEpisode[] }>(
    `/3/2/movie/episode/${encodeURIComponent(movieId)}?page=${page}&search=`,
  )
  return data?.episode ?? []
}

async function collectEpisodes(movieId: string): Promise<AnimeinEpisode[]> {
  const all: AnimeinEpisode[] = []
  for (let start = 0; start < EPISODE_LIST_MAX_PAGES; start += EPISODE_FETCH_BATCH) {
    const pages = Array.from(
      { length: Math.min(EPISODE_FETCH_BATCH, EPISODE_LIST_MAX_PAGES - start) },
      (_, offset) => start + offset,
    )
    const results = await Promise.all(pages.map(page => fetchEpisodePage(movieId, page)))
    let reachedEnd = false
    for (const list of results) {
      all.push(...list)
      if (list.length < EPISODE_PAGE_SIZE) reachedEnd = true
    }
    if (reachedEnd) break
  }
  return all
}

interface LatestEpisode {
  index: string
  date: string
}

async function latestEpisode(movieId: string): Promise<LatestEpisode | null> {
  const list = await fetchEpisodePage(movieId, 0)
  let best: AnimeinEpisode | null = null
  for (const entry of list) {
    const index = Number(entry.index)
    if (!Number.isFinite(index)) continue
    if (!best || index > Number(best.index)) best = entry
  }
  return best ? { index: best.index, date: best.key_time ?? '' } : null
}

async function scrapeOngoingFresh(page: number): Promise<ListResult> {
  if (page > 1) return { anime: [], totalPages: 1 }
  const day = wibDay()
  const data = await apiGet<{ movie?: AnimeinMovie[] }>(`/3/2/schedule/data?day=${day}`)
  const movies = (data?.movie ?? []).filter(movie => movie.status === 'ONGOING')
  const latest = await mapWithConcurrency(
    movies.map(movie => String(movie.id)),
    LATEST_EPISODE_CONCURRENCY,
    movieId => latestEpisode(movieId),
  )
  const label = DAY_LABEL[day] ?? ''

  const anime: ScrapedAnimeCard[] = movies.map((movie, index) => {
    const episode = latest[index]
    return {
      title: movie.title,
      slug: String(movie.id),
      thumbnail: absoluteAsset(movie.image_cover || movie.image_poster),
      episode: episode ? `Episode ${episode.index}` : '',
      day: label,
      date: episode?.date ?? '',
    }
  })
  return { anime, totalPages: 1 }
}

async function scrapeCompletedFresh(page: number): Promise<ListResult> {
  const data = await apiGet<{ movie?: AnimeinMovie[] }>(
    `/3/2/explore/movie?page=${Math.max(0, page - 1)}&sort=latest&keyword=`,
  )
  const anime: ScrapedAnimeCard[] = (data?.movie ?? [])
    .filter(movie => movie.status === 'FINISHED')
    .map(movie => ({
      title: movie.title,
      slug: String(movie.id),
      thumbnail: absoluteAsset(movie.image_cover || movie.image_poster),
      episode: '',
      day: '',
      date: movie.aired_start || '',
    }))
  return { anime, totalPages: COMPLETED_PAGE_LIMIT }
}

async function scrapeAnimeDetailFresh(slug: string): Promise<ScrapedAnimeDetail | null> {
  const data = await apiGet<{ movie?: AnimeinMovie }>(`/3/2/movie/detail/${encodeURIComponent(slug)}`)
  const movie = data?.movie
  if (!movie) return null

  const episodes = await collectEpisodes(String(movie.id))
  const ordered = [...episodes].sort((a, b) => Number(a.index) - Number(b.index))

  return {
    title: movie.title,
    japanese: movie.synonyms || '',
    score: '',
    producer: '',
    type: movie.type || '',
    status: movie.status === 'FINISHED' ? 'Completed' : 'Ongoing',
    totalEpisode: String(ordered.length),
    duration: '',
    releaseDate: movie.aired_start || movie.year || '',
    studio: movie.studio || '',
    genres: parseGenres(movie.genre),
    thumbnail: absoluteAsset(movie.image_cover || movie.image_poster),
    synopsis: movie.synopsis || '',
    episodes: ordered.map(entry => ({
      title: entry.title || `Episode ${entry.index}`,
      slug: episodeSlug(String(movie.id), entry.index, entry.id),
      date: entry.key_time || '',
    })),
  }
}

async function scrapeEpisodeFresh(slug: string): Promise<EpisodeData | null> {
  const match = slug.match(/^(\d+)-episode-(\d+)-(\d+)$/)
  if (!match) return null
  const movieId = match[1]!
  const index = match[2]!
  const episodeId = match[3]!

  const data = await apiGet<{ episode?: AnimeinEpisode, server?: AnimeinServer[] }>(
    `/3/2/episode/streamnew/${encodeURIComponent(episodeId)}`,
  )
  const servers = (data?.server ?? []).filter(server => server.type === 'direct' && server.link)
  if (servers.length === 0) return null

  const grouped = new Map<string, { name: string, dataContent: string }[]>()
  for (const server of servers) {
    const quality = server.quality || 'HD'
    const sealed = await sealStreamToken(`animein:${server.link}`)
    const list = grouped.get(quality) ?? []
    list.push({ name: server.name || 'Server', dataContent: sealed })
    grouped.set(quality, list)
  }

  const episode = data?.episode
  return {
    title: episode?.title || `Episode ${index}`,
    animeSlug: movieId,
    animeTitle: '',
    mirrors: [...grouped.entries()].map(([quality, sources]) => ({ quality, sources })),
    episodeNav: [],
    thumbnail: absoluteAsset(episode?.image),
  }
}

async function resolveMirror(opaque: string): Promise<string | null> {
  if (!opaque.startsWith('http')) return null
  return opaque
}

export const animein: AnimeSource = {
  id: 'animein',
  name: 'ANIMEIN',
  baseUrl: 'https://animeinweb.com',
  ongoingFresh: scrapeOngoingFresh,
  completedFresh: scrapeCompletedFresh,
  detailFresh: scrapeAnimeDetailFresh,
  episodeFresh: scrapeEpisodeFresh,
  resolveMirror,
}

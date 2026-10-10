import { Effect } from 'effect'
import { sealStreamToken } from '../media/stream'
import { Http } from '../net/http'
import type { AnimeSource, EpisodeData, ListResult, ScrapedAnimeCard, ScrapedAnimeDetail, SourceEffect } from './types'

const ASSET_BASE = 'https://xyz-api.animein.net'
const API_BASE = ASSET_BASE
const REQUEST_TIMEOUT_MS = 8000
const COMPLETED_PAGE_LIMIT = 100
const EPISODE_PAGE_SIZE = 30
const EPISODE_LIST_MAX_PAGES = 45
const EPISODE_FETCH_BATCH = 6
const DAY_BY_INDEX = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU']

interface AnimeinMovie {
  id: string
  title: string
  synopsis?: string
  synonyms?: string
  image_poster?: string
  image_cover?: string
  type?: string
  year?: string
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

function apiGet<T>(path: string): Effect.Effect<T | null, never, Http> {
  return Effect.gen(function* () {
    const http = yield* Http
    const res = yield* http.text(`${API_BASE}${path}`, { timeoutMs: REQUEST_TIMEOUT_MS, proxy: true })
    if (!res || res.status !== 200) return null
    return yield* Effect.try({
      try: () => {
        const body = JSON.parse(res.text) as { status?: number; error?: boolean; data?: T }
        return !body.error && body.status === 200 && body.data ? body.data : null
      },
      catch: () => new Error('invalid animein payload'),
    }).pipe(Effect.catch(() => Effect.succeed(null)))
  })
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

function episodeSlug(movieId: string, index: string, episodeId: string): string {
  return `${movieId}-episode-${index}-${episodeId}`
}

function fetchEpisodePage(movieId: string, page: number): Effect.Effect<AnimeinEpisode[], never, Http> {
  return apiGet<{ episode?: AnimeinEpisode[] }>(
    `/3/2/movie/episode/${encodeURIComponent(movieId)}?page=${page}&search=`,
  ).pipe(Effect.map(data => data?.episode ?? []))
}

function collectEpisodes(movieId: string): Effect.Effect<AnimeinEpisode[], never, Http> {
  return Effect.gen(function* () {
    const all: AnimeinEpisode[] = []
    const first = yield* fetchEpisodePage(movieId, 0)
    all.push(...first)
    if (first.length < EPISODE_PAGE_SIZE) return all
    for (let start = 1; start < EPISODE_LIST_MAX_PAGES; start += EPISODE_FETCH_BATCH) {
      const pages = Array.from(
        { length: Math.min(EPISODE_FETCH_BATCH, EPISODE_LIST_MAX_PAGES - start) },
        (_, offset) => start + offset,
      )
      const results = yield* Effect.forEach(pages, page => fetchEpisodePage(movieId, page), {
        concurrency: 'unbounded',
      })
      let reachedEnd = false
      for (const list of results) {
        all.push(...list)
        if (list.length < EPISODE_PAGE_SIZE) reachedEnd = true
      }
      if (reachedEnd) break
    }
    return all
  })
}

interface LatestEpisode {
  index: string
  date: string
}

function latestEpisode(movieId: string): Effect.Effect<LatestEpisode | null, never, Http> {
  return fetchEpisodePage(movieId, 0).pipe(
    Effect.map(list => {
      let best: AnimeinEpisode | null = null
      for (const entry of list) {
        const index = Number(entry.index)
        if (!Number.isFinite(index)) continue
        if (!best || index > Number(best.index)) best = entry
      }
      return best ? { index: best.index, date: best.key_time ?? '' } : null
    }),
  )
}

function scrapeOngoingFresh(page: number): SourceEffect<ListResult> {
  return Effect.gen(function* () {
    if (page > 1) return { anime: [], totalPages: 1 }
    const day = wibDay()
    const data = yield* apiGet<{ movie?: AnimeinMovie[] }>(`/3/2/schedule/data?day=${day}`)
    const movies = (data?.movie ?? []).filter(movie => movie.status === 'ONGOING')
    const latest = yield* Effect.forEach(movies, movie => latestEpisode(String(movie.id)), { concurrency: 'unbounded' })

    const anime: ScrapedAnimeCard[] = movies.map((movie, index) => {
      const episode = latest[index]
      return {
        slug: String(movie.id),
        date: episode?.date ?? '',
      }
    })
    return { anime, totalPages: 1 }
  })
}

function scrapeCompletedFresh(page: number): SourceEffect<ListResult> {
  return Effect.gen(function* () {
    const data = yield* apiGet<{ movie?: AnimeinMovie[] }>(
      `/3/2/explore/movie?page=${Math.max(0, page - 1)}&sort=latest&keyword=`,
    )
    const anime: ScrapedAnimeCard[] = (data?.movie ?? [])
      .filter(movie => movie.status === 'FINISHED')
      .map(movie => ({
        slug: String(movie.id),
        date: movie.aired_start || '',
      }))
    return { anime, totalPages: COMPLETED_PAGE_LIMIT }
  })
}

function scrapeAnimeDetailFresh(slug: string): SourceEffect<ScrapedAnimeDetail | null> {
  return Effect.gen(function* () {
    const data = yield* apiGet<{ movie?: AnimeinMovie }>(`/3/2/movie/detail/${encodeURIComponent(slug)}`)
    const movie = data?.movie
    if (!movie) return null

    const episodes = yield* collectEpisodes(String(movie.id))
    const ordered = episodes.toSorted((a, b) => Number(a.index) - Number(b.index))

    return {
      title: movie.title,
      japanese: movie.synonyms || '',
      status: movie.status === 'FINISHED' ? 'Completed' : 'Ongoing',
      releaseDate: movie.aired_start || movie.year || '',
      episodes: ordered.map(entry => ({
        title: entry.title || `Episode ${entry.index}`,
        slug: episodeSlug(String(movie.id), entry.index, entry.id),
        date: entry.key_time || '',
      })),
    }
  })
}

function scrapeEpisodeFresh(slug: string): SourceEffect<EpisodeData | null> {
  return Effect.gen(function* () {
    const match = slug.match(/^(\d+)-episode-(\d+)-(\d+)$/)
    if (!match) return null
    const movieId = match[1]!
    const index = match[2]!
    const episodeId = match[3]!

    const data = yield* apiGet<{ episode?: AnimeinEpisode; server?: AnimeinServer[] }>(
      `/3/2/episode/streamnew/${encodeURIComponent(episodeId)}`,
    )
    const episode = data?.episode
    if (!episode) return null

    const servers = (data?.server ?? []).filter(server => server.type === 'direct' && server.link)

    const grouped = new Map<string, { name: string; dataContent: string }[]>()
    for (const server of servers) {
      const quality = server.quality || 'HD'
      const sealed = yield* Effect.promise(() => sealStreamToken(`animein:${server.link}`))
      const list = grouped.get(quality) ?? []
      list.push({ name: server.name || 'Server', dataContent: sealed })
      grouped.set(quality, list)
    }

    return {
      title: episode.title || `Episode ${index}`,
      animeSlug: movieId,
      animeTitle: '',
      mirrors: [...grouped.entries()].map(([quality, sources]) => ({ quality, sources })),
      episodeNav: [],
      thumbnail: absoluteAsset(episode.image),
    }
  })
}

function resolveMirror(opaque: string): SourceEffect<string | null> {
  return Effect.succeed(opaque.startsWith('http') ? opaque : null)
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

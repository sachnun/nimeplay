import { Effect } from 'effect'
import { sealStreamToken } from '../media/stream'
import { Http } from '../net/http'
import { keepSeriesEpisodes } from './shared'
import type { AnimeSource, EpisodeData, ListResult, ScrapedAnimeCard, ScrapedAnimeDetail, SourceEffect } from './types'

const SITE_BASE = 'https://api.nakanime.my.id'
const API_BASE = 'https://anime.nakanime.my.id/api'
const REQUEST_TIMEOUT_MS = 8000
const QUALITY_RE = /^\d{3,4}p$/i
const DEFAULT_QUALITY = '720p'

interface ApiEnvelope<T> {
  data?: T
  lastPage?: number
}

interface NakanimeCard {
  title: string
  slug: string
  thumbnail?: string
  episode?: string
  status?: string
  date?: string
}

interface NakanimeEpisode {
  title: string
  slug: string
  date?: string
}

interface NakanimeDetail {
  title: string
  slug?: string
  imgUrl?: string
  description?: string
  rating?: string
  info?: string[]
  genre?: { name: string; slug: string }[]
  episodes?: NakanimeEpisode[]
}

interface NakanimeStreamData {
  title?: string
  thumbnail?: string
  anime?: string
  slug?: string
  video_uri?: string
  prev_eps?: string | null
  next_eps?: string | null
  iframe_uri?: { title?: string; video_uri?: string }[]
}

function apiGet<T>(path: string): Effect.Effect<{ data: T | null; lastPage: number }, never, Http> {
  return Effect.gen(function* () {
    const http = yield* Http
    const res = yield* http.text(`${API_BASE}${path}`, { timeoutMs: REQUEST_TIMEOUT_MS })
    if (!res || res.status !== 200 || !res.text.trim()) return { data: null, lastPage: 1 }
    const parsed = yield* Effect.try({
      try: () => JSON.parse(res.text) as ApiEnvelope<T>,
      catch: () => new Error('invalid nakanime payload'),
    }).pipe(Effect.catch(() => Effect.succeed(null)))
    if (!parsed || parsed.data === undefined || parsed.data === null) return { data: null, lastPage: 1 }
    return { data: parsed.data, lastPage: Math.max(1, Number(parsed.lastPage) || 1) }
  })
}

function normalizeStatus(value: string | undefined): 'ONGOING' | 'COMPLETED' | undefined {
  const status = (value ?? '').toLowerCase()
  if (status.includes('completed') || status.includes('finished')) return 'COMPLETED'
  if (status.includes('ongoing')) return 'ONGOING'
  return undefined
}

function toCard(card: NakanimeCard, fallback: 'ONGOING' | 'COMPLETED'): ScrapedAnimeCard {
  return {
    slug: card.slug,
    date: card.date ?? '',
    status: normalizeStatus(card.status) ?? fallback,
  }
}

function scrapeOngoingFresh(page: number): SourceEffect<ListResult> {
  return Effect.gen(function* () {
    if (page > 1) return { anime: [], totalPages: 1 }
    const { data } = yield* apiGet<NakanimeCard[]>('/anime/ongoing')
    return { anime: (data ?? []).map(card => toCard(card, 'ONGOING')), totalPages: 1 }
  })
}

function scrapeCompletedFresh(page: number): SourceEffect<ListResult> {
  return Effect.gen(function* () {
    const { data, lastPage } = yield* apiGet<NakanimeCard[]>(`/anime/all/?page=${page}`)
    const anime = (data ?? [])
      .filter(card => normalizeStatus(card.status) === 'COMPLETED')
      .map(card => toCard(card, 'COMPLETED'))
    return { anime, totalPages: lastPage }
  })
}

function parseInfo(info: string[] | undefined): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of info ?? []) {
    const at = line.indexOf(':')
    if (at <= 0) continue
    map.set(line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim())
  }
  return map
}

function scrapeAnimeDetailFresh(slug: string): SourceEffect<ScrapedAnimeDetail | null> {
  return Effect.gen(function* () {
    const { data } = yield* apiGet<NakanimeDetail>(`/anime/?name=${encodeURIComponent(slug)}`)
    if (!data?.title) return null
    const info = parseInfo(data.info)
    const episodes = keepSeriesEpisodes(
      data.title,
      data.slug || slug,
      (data.episodes ?? []).filter(episode => episode.slug),
    )
    return {
      title: data.title,
      japanese: '',
      status: info.get('status') ?? '',
      releaseDate: info.get('released') ?? '',
      episodes: episodes.map(episode => ({ title: episode.title, slug: episode.slug, date: episode.date ?? '' })),
    }
  })
}

function decodeUrl(value: string | undefined): string {
  if (!value) return ''
  return value.replace(/&amp;/g, '&').trim()
}

function qualityLabel(title: string | undefined): string {
  const value = (title ?? '').trim()
  return QUALITY_RE.test(value) ? value : DEFAULT_QUALITY
}

function scrapeEpisodeFresh(slug: string): SourceEffect<EpisodeData | null> {
  return Effect.gen(function* () {
    const { data } = yield* apiGet<NakanimeStreamData>(`/anime/data/?slug=${encodeURIComponent(slug)}`)
    if (!data) return null

    const seen = new Set<string>()
    const groups = new Map<string, { name: string; dataContent: string }[]>()
    const add = (quality: string, url: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        if (!url.startsWith('http') || seen.has(url)) return
        seen.add(url)
        const dataContent = yield* Effect.promise(() => sealStreamToken(`nakanime:${url}`))
        const list = groups.get(quality) ?? []
        list.push({ name: 'Blogger', dataContent })
        groups.set(quality, list)
      })

    yield* Effect.forEach(
      data.iframe_uri ?? [],
      stream => add(qualityLabel(stream.title), decodeUrl(stream.video_uri)),
      { concurrency: 'unbounded', discard: true },
    )
    if (groups.size === 0) yield* add(DEFAULT_QUALITY, decodeUrl(data.video_uri))

    const episodeNav: { title: string; slug: string }[] = []
    if (data.prev_eps) episodeNav.push({ title: 'Previous Episode', slug: data.prev_eps })
    if (data.next_eps) episodeNav.push({ title: 'Next Episode', slug: data.next_eps })

    return {
      title: data.title ?? '',
      animeSlug: data.slug ?? '',
      animeTitle: data.anime ?? '',
      mirrors: [...groups.entries()].map(([quality, sources]) => ({ quality, sources })),
      episodeNav,
      thumbnail: decodeUrl(data.thumbnail),
    }
  })
}

function resolveMirror(opaque: string): SourceEffect<string | null> {
  return Effect.succeed(opaque.startsWith('http') ? opaque : null)
}

export const nakanime: AnimeSource = {
  id: 'nakanime',
  name: 'Nakanime',
  baseUrl: SITE_BASE,
  ongoingFresh: scrapeOngoingFresh,
  completedFresh: scrapeCompletedFresh,
  detailFresh: scrapeAnimeDetailFresh,
  episodeFresh: scrapeEpisodeFresh,
  resolveMirror,
}

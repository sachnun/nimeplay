import { plainGet } from '../net/fetch'
import { keepSeriesEpisodes } from './shared'
import { sealStreamToken } from '../media/stream'
import type { AnimeSource, EpisodeData, ListResult, ScrapedAnimeCard, ScrapedAnimeDetail } from './types'

const SITE_BASE = 'https://api.nakanime.my.id'
const API_BASE = 'https://anime.nakanime.my.id/api'
const REQUEST_TIMEOUT_MS = 8000
const QUALITY_RE = /^\d{3,4}p$/i
const DEFAULT_QUALITY = '720p'
const MAX_ATTEMPTS = 6
const BASE_BACKOFF_MS = 500
const MAX_BACKOFF_MS = 10_000

function retryAfterMs(headers: Record<string, string>): number | null {
  const value = headers['retry-after']
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const at = Date.parse(value)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null
}

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
  genre?: { name: string, slug: string }[]
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
  iframe_uri?: { title?: string, video_uri?: string }[]
}

async function apiGet<T>(path: string): Promise<{ data: T | null, lastPage: number }> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await plainGet(`${API_BASE}${path}`, { timeoutMs: REQUEST_TIMEOUT_MS })
    if (res && res.status === 200 && res.text.trim()) {
      try {
        const body = JSON.parse(res.text) as ApiEnvelope<T>
        if (body.data !== undefined && body.data !== null) {
          return { data: body.data, lastPage: Math.max(1, Number(body.lastPage) || 1) }
        }
      }
      catch {
        // fall through to retry on malformed body
      }
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      const retryAfter = res && (res.status === 429 || res.status === 503) ? retryAfterMs(res.headers) : null
      const wait = retryAfter === null
        ? Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt) + Math.floor(Math.random() * 250)
        : Math.min(retryAfter, MAX_BACKOFF_MS)
      await new Promise(resolve => setTimeout(resolve, wait))
    }
  }
  return { data: null, lastPage: 1 }
}

function normalizeStatus(value: string | undefined): 'ONGOING' | 'COMPLETED' | undefined {
  const status = (value ?? '').toLowerCase()
  if (status.includes('completed') || status.includes('finished')) return 'COMPLETED'
  if (status.includes('ongoing')) return 'ONGOING'
  return undefined
}

function toCard(card: NakanimeCard, fallback: 'ONGOING' | 'COMPLETED'): ScrapedAnimeCard {
  return {
    title: card.title,
    slug: card.slug,
    thumbnail: card.thumbnail ?? '',
    episode: card.episode ?? '',
    day: '',
    date: card.date ?? '',
    status: normalizeStatus(card.status) ?? fallback,
  }
}

async function scrapeOngoingFresh(page: number): Promise<ListResult> {
  if (page > 1) return { anime: [], totalPages: 1 }
  const { data } = await apiGet<NakanimeCard[]>('/anime/ongoing')
  return { anime: (data ?? []).map(card => toCard(card, 'ONGOING')), totalPages: 1 }
}

async function scrapeCompletedFresh(page: number): Promise<ListResult> {
  const { data, lastPage } = await apiGet<NakanimeCard[]>(`/anime/all/?page=${page}`)
  const anime = (data ?? [])
    .filter(card => normalizeStatus(card.status) === 'COMPLETED')
    .map(card => toCard(card, 'COMPLETED'))
  return { anime, totalPages: lastPage }
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

async function scrapeAnimeDetailFresh(slug: string): Promise<ScrapedAnimeDetail | null> {
  const { data } = await apiGet<NakanimeDetail>(`/anime/?name=${encodeURIComponent(slug)}`)
  if (!data || !data.title) return null
  const info = parseInfo(data.info)
  const episodes = keepSeriesEpisodes(data.title, data.slug || slug, (data.episodes ?? []).filter(episode => episode.slug))
  return {
    title: data.title,
    japanese: '',
    score: data.rating ?? '',
    producer: '',
    type: info.get('type') ?? '',
    status: info.get('status') ?? '',
    totalEpisode: String(episodes.length),
    duration: '',
    releaseDate: info.get('released') ?? '',
    studio: info.get('studio') ?? '',
    genres: (data.genre ?? []).map(genre => ({ name: genre.name, slug: genre.slug })),
    thumbnail: data.imgUrl ?? '',
    synopsis: data.description ?? '',
    episodes: episodes.map(episode => ({ title: episode.title, slug: episode.slug, date: episode.date ?? '' })),
  }
}

function decodeUrl(value: string | undefined): string {
  if (!value) return ''
  return value.replace(/&amp;/g, '&').trim()
}

function qualityLabel(title: string | undefined): string {
  const value = (title ?? '').trim()
  return QUALITY_RE.test(value) ? value : DEFAULT_QUALITY
}

async function scrapeEpisodeFresh(slug: string): Promise<EpisodeData | null> {
  const { data } = await apiGet<NakanimeStreamData>(`/anime/data/?slug=${encodeURIComponent(slug)}`)
  if (!data) return null

  const seen = new Set<string>()
  const groups = new Map<string, { name: string, dataContent: string }[]>()
  const add = async (quality: string, url: string): Promise<void> => {
    if (!url.startsWith('http') || seen.has(url)) return
    seen.add(url)
    const list = groups.get(quality) ?? []
    list.push({ name: 'Blogger', dataContent: await sealStreamToken(`nakanime:${url}`) })
    groups.set(quality, list)
  }

  for (const stream of data.iframe_uri ?? []) {
    await add(qualityLabel(stream.title), decodeUrl(stream.video_uri))
  }
  if (groups.size === 0) await add(DEFAULT_QUALITY, decodeUrl(data.video_uri))

  const episodeNav: { title: string, slug: string }[] = []
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
}

async function resolveMirror(opaque: string): Promise<string | null> {
  return opaque.startsWith('http') ? opaque : null
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

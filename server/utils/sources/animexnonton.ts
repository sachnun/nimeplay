import { sealStreamToken } from '../stream'
import { proxyUrl } from '../proxy'
import type { AnimeSource, EpisodeData, ListResult, ScrapedAnimeCard, ScrapedAnimeDetail } from './types'

const API_BASE_FALLBACK = 'https://wincamp.web.id/animexnonton/api'
const CONFIG_URL = 'https://wincampdotorg.github.io/config/api/animexnonton.json'
const BASE_TTL_MS = 10 * 60 * 1000
const TIMEOUT_MS = 12000
const PAGE_SIZE = 24
const ORIGIN_HOST = 'whatbox.ca'
const PLAYER_UA = 'ExoPlayerLib/1.11.1'
const API_HEADERS: Record<string, string> = {
  'data-agent': 'AnimeXNonton 26.9.5/18',
  'user-agent': 'okhttp/5.5.0',
}

const MIRROR_FIELDS: { quality: string, field: string, name: string }[] = [
  { quality: '1080p', field: 'channel_url_fhd', name: 'Origin' },
  { quality: '720p', field: 'channel_url_hd', name: 'FB' },
  { quality: '720p', field: 'channel_url_hd_ori', name: 'Origin' },
  { quality: '480p', field: 'channel_url', name: 'FB' },
  { quality: '480p', field: 'channel_url_ori', name: 'Origin' },
  { quality: '1080p', field: 'gdrive_url', name: 'GDrive' },
]

interface CategoryItem {
  category_id?: number
  cid?: number
  category_name?: string
  count_anime?: string
  img_url?: string
  rating?: string | null
  years?: string | number
}

interface ListResponse {
  count_total?: number
  categories?: CategoryItem[]
}

interface CategoryPost {
  channel_id?: number
  channel_name?: string
}

interface DetailResponse {
  category?: {
    cid?: number
    category_name?: string
    img_url?: string
    ongoing?: number
    genre?: string
    years?: string | number
    rating?: string | null
  }
  posts?: CategoryPost[]
}

interface EpisodeResponse {
  channel_id?: number
  category_id?: number | string
  category_name?: string
  channel_name?: string
  img_url?: string
  secretKey?: string
  [key: string]: unknown
}

let cachedConfig: { base: string, auth: string | null, at: number } | null = null

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const length = Math.floor(hex.length / 2)
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

function bytesFromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function decrypt(keyHex: string, payload: string): Promise<string | null> {
  try {
    const keyBytes = hexToBytes(keyHex)
    if (keyBytes.length !== 32) return null
    const raw = bytesFromBase64(payload)
    if (raw.length <= 28) return null
    const iv = new Uint8Array(raw.subarray(16, 28))
    const data = new Uint8Array(raw.length - 12)
    data.set(raw.slice(28), 0)
    data.set(raw.slice(0, 16), raw.length - 28)
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
    return new TextDecoder().decode(plain)
  }
  catch {
    return null
  }
}

async function loadConfig(): Promise<{ base: string, auth: string | null }> {
  if (cachedConfig && Date.now() - cachedConfig.at < BASE_TTL_MS) return cachedConfig
  let base = API_BASE_FALLBACK
  let auth: string | null = null
  try {
    const res = await fetch(CONFIG_URL, { headers: API_HEADERS, signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const config = await res.json() as { hex?: string, server_url?: string, video_pass?: string }
      if (config.hex) {
        if (config.server_url) {
          const resolved = await decrypt(config.hex, config.server_url)
          if (resolved && /^https?:\/\//.test(resolved)) base = resolved.replace(/\/+$/, '')
        }
        if (config.video_pass) {
          const pass = await decrypt(config.hex, config.video_pass)
          if (pass && pass.startsWith('Basic ')) auth = pass
        }
      }
    }
  }
  catch {
  }
  cachedConfig = { base, auth, at: Date.now() }
  return cachedConfig
}

async function apiBase(): Promise<string> {
  return (await loadConfig()).base
}

async function postEndpoint<T>(name: string, fields: Record<string, string | number>): Promise<T | null> {
  try {
    const base = await apiBase()
    const body = new URLSearchParams()
    for (const [key, value] of Object.entries(fields)) body.set(key, String(value))
    const res = await fetch(proxyUrl(`${base}/phalcon/api/${name}/`), {
      method: 'POST',
      headers: { ...API_HEADERS, 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    return await res.json() as T
  }
  catch {
    return null
  }
}

function parseGenres(raw: string | undefined): { name: string, slug: string }[] {
  if (!raw) return []
  return raw.split(',').map(name => name.replace(/\u00a0/g, ' ').trim()).filter(Boolean).map(name => ({
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
  }))
}

function parseEpisodeNumber(name: string): number | null {
  const episode = name.match(/episode\s*(\d+)/i)
  if (episode) return Number(episode[1])
  const short = name.match(/\bE(\d{1,4})\b/i)
  if (short) return Number(short[1])
  const trailing = name.match(/(?:^|\D)(\d{1,3})\s*(?:\[END\])?\s*$/i)
  if (trailing) return Number(trailing[1])
  return null
}

function toCard(item: CategoryItem, status: 'ONGOING' | 'COMPLETED'): ScrapedAnimeCard {
  const thumbnail = item.img_url && item.img_url !== '#' ? item.img_url : ''
  return {
    title: (item.category_name ?? '').trim(),
    slug: String(item.category_id ?? item.cid ?? ''),
    thumbnail,
    episode: item.count_anime ? `Episode ${item.count_anime}` : '',
    day: '',
    date: '',
    ...(item.rating ? { rating: item.rating } : {}),
    status,
  }
}

async function scrapeCategory(status: 'ONGOING' | 'COMPLETED', page: number): Promise<ListResult> {
  const name = status === 'ONGOING' ? 'get_category_ongoing' : 'get_category_not_ongoing'
  const data = await postEndpoint<ListResponse>(name, { page, count: PAGE_SIZE, lang: 'id', isAPKvalid: 'true' })
  if (!data) return { anime: [], totalPages: 1 }
  const anime = (data.categories ?? []).map(item => toCard(item, status)).filter(card => card.slug && card.title)
  const total = data.count_total ?? anime.length
  return { anime, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

async function scrapeAnimeDetailFresh(slug: string): Promise<ScrapedAnimeDetail | null> {
  const data = await postEndpoint<DetailResponse>('get_category_posts_secure', { id: slug, isAPKvalid: 'true' })
  const category = data?.category
  const title = (category?.category_name ?? '').trim()
  if (!title) return null

  const posts = (data?.posts ?? []).filter((post): post is CategoryPost & { channel_id: number } => Number.isFinite(post.channel_id))
  const episodes = posts
    .map((post) => {
      const number = parseEpisodeNumber(post.channel_name ?? '') ?? (posts.length === 1 ? 1 : null)
      if (number === null) return null
      return {
        number,
        title: (post.channel_name ?? '').trim() || `Episode ${number}`,
        slug: `episode-${number}-${post.channel_id}`,
        date: '',
      }
    })
    .filter((entry): entry is { number: number, title: string, slug: string, date: string } => entry !== null)
    .sort((a, b) => a.number - b.number)
    .map(({ title: episodeTitle, slug: episodeSlug, date }) => ({ title: episodeTitle, slug: episodeSlug, date }))

  return {
    title,
    japanese: '',
    score: category?.rating ? String(category.rating) : '',
    producer: '',
    type: '',
    status: category?.ongoing ? 'Ongoing' : 'Completed',
    totalEpisode: String(posts.length),
    duration: '',
    releaseDate: category?.years ? String(category.years) : '',
    studio: '',
    genres: parseGenres(category?.genre),
    thumbnail: category?.img_url && category.img_url !== '#' ? category.img_url : '',
    synopsis: '',
    episodes,
  }
}

async function scrapeEpisodeFresh(slug: string): Promise<EpisodeData | null> {
  const match = slug.match(/^episode-\d+-(\d+)$/)
  if (!match) return null
  const channelId = match[1]!

  const data = await postEndpoint<EpisodeResponse>('get_post_description', { channel_id: channelId, isAPKvalid: 'true' })
  if (!data?.channel_name) return null

  const grouped = new Map<string, { name: string, dataContent: string }[]>()
  if (data.secretKey) {
    for (const { quality, field, name } of MIRROR_FIELDS) {
      const value = data[field]
      if (typeof value !== 'string' || value.length === 0) continue
      const url = await decrypt(data.secretKey, value)
      if (!url || !/^https?:\/\//.test(url)) continue
      const list = grouped.get(quality) ?? []
      list.push({ name, dataContent: await sealStreamToken(`animexnonton:${channelId}|${field}`) })
      grouped.set(quality, list)
    }
  }

  return {
    title: data.channel_name,
    animeSlug: String(data.category_id ?? ''),
    animeTitle: data.category_name ?? '',
    mirrors: [...grouped.entries()].map(([quality, sources]) => ({ quality, sources })),
    episodeNav: [],
    thumbnail: typeof data.img_url === 'string' && data.img_url !== '#' ? data.img_url : '',
  }
}

function gdriveDirect(url: string): string | null {
  const id = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/)?.[1] ?? url.match(/[?&]id=([^&]+)/)?.[1]
  return id ? `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t` : null
}

async function resolveMirror(opaque: string): Promise<string | null> {
  if (opaque.startsWith('http')) return opaque
  const match = opaque.match(/^(\d+)\|([a-z0-9_]+)$/)
  if (!match) return null
  const [, channelId, field] = match
  if (!channelId || !field || !MIRROR_FIELDS.some(entry => entry.field === field)) return null

  const data = await postEndpoint<EpisodeResponse>('get_post_description', { channel_id: channelId, isAPKvalid: 'true' })
  const payload = data?.[field]
  if (!data?.secretKey || typeof payload !== 'string') return null
  const url = await decrypt(data.secretKey, payload)
  if (!url) return null
  if (field === 'gdrive_url') return gdriveDirect(url)
  return /^https?:\/\//.test(url) ? url : null
}

async function proxyHeaders(url: string): Promise<{ headers?: Record<string, string> } | null> {
  let host = ''
  try {
    host = new URL(url).host
  }
  catch {
    return null
  }
  if (!host.includes(ORIGIN_HOST)) return null
  const { auth } = await loadConfig()
  return { headers: { ...(auth ? { Authorization: auth } : {}), 'User-Agent': PLAYER_UA, Referer: '' } }
}

export const animexnonton: AnimeSource = {
  id: 'animexnonton',
  name: 'Anime X Nonton',
  baseUrl: 'https://wincamp.web.id/animexnonton',
  ongoingFresh: page => scrapeCategory('ONGOING', page),
  completedFresh: page => scrapeCategory('COMPLETED', page),
  detailFresh: scrapeAnimeDetailFresh,
  episodeFresh: scrapeEpisodeFresh,
  resolveMirror,
  proxy: proxyHeaders,
}

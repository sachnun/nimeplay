import type { H3Event } from 'h3'
import { getRequestURL } from 'h3'
import { cloudflareEnv } from './env'
import { getSpoofHeaders } from './spoof'

const MAL_CDN = 'https://cdn.myanimelist.net/images/'
const MAL_REFERER = 'https://myanimelist.net/'
const FETCH_TIMEOUT_MS = 15000

interface R2HttpMetadata {
  contentType?: string
}

interface R2ObjectHead {
  httpEtag?: string
  httpMetadata?: R2HttpMetadata
}

interface R2ObjectBody extends R2ObjectHead {
  body?: ReadableStream | null
}

interface R2BucketLike {
  get(key: string): Promise<R2ObjectBody | null>
  head(key: string): Promise<R2ObjectHead | null>
  put(key: string, value: ArrayBuffer | ReadableStream, options?: { httpMetadata?: R2HttpMetadata }): Promise<unknown>
}

export function r2Bucket(): R2BucketLike | null {
  const env = cloudflareEnv() as { R2?: R2BucketLike, POSTERS?: R2BucketLike }
  return env?.R2 ?? env?.POSTERS ?? null
}

export function isValidMediaKey(key: string): boolean {
  if (!key || key.includes('..')) return false
  return /^(posters|characters|voiceactors)\/[a-zA-Z0-9_/.-]+$/i.test(key)
}

export function toR2Url(url: string | null | undefined, type: 'posters' | 'characters' | 'voiceactors'): string {
  if (!url) return ''
  if (url.startsWith('/r2/')) return url
  if (url.startsWith('/posters/')) return `/r2/posters/${url.slice(9)}`
  if (url.startsWith('/characters/')) return `/r2/characters/${url.slice(12)}`
  if (url.startsWith('/voiceactors/')) return `/r2/voiceactors/${url.slice(13)}`
  if (url.startsWith('/img/posters/cdn.myanimelist.net/images/anime/')) {
    return `/r2/posters/${url.slice('/img/posters/cdn.myanimelist.net/images/anime/'.length)}`
  }

  const prefix = `${MAL_CDN}${type === 'posters' ? 'anime/' : `${type}/`}`
  if (url.startsWith(prefix)) {
    const cleanUrl = url.split('?')[0] || ''
    const sub = cleanUrl.slice(prefix.length)
    return `/r2/${type}/${sub}`
  }

  return url
}

export function posterSrc(value: string | null | undefined): string {
  return toR2Url(value, 'posters')
}

export function toAbsoluteUrl(path: string | null | undefined, event?: H3Event): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (!path.startsWith('/r2/')) return path
  if (!event) return path
  return `${getRequestURL(event).origin}${path}`
}

export function absolutePosterSrc(value: string | null | undefined, event?: H3Event): string {
  return toAbsoluteUrl(posterSrc(value), event)
}

export function keyToOrigin(key: string): string | null {
  if (key.startsWith('posters/')) {
    return `${MAL_CDN}anime/${key.slice(8)}`
  }
  if (key.startsWith('characters/') || key.startsWith('voiceactors/')) {
    return `${MAL_CDN}${key}`
  }
  return null
}

export async function hasCachedMedia(key: string): Promise<boolean> {
  const bucket = r2Bucket()
  if (!bucket) return false
  const head = await bucket.head(key).catch(() => null)
  return head !== null
}

export interface MediaObject {
  body: ReadableStream | null
  contentType: string
  etag?: string
}

export async function getCachedMedia(key: string): Promise<MediaObject | null> {
  const bucket = r2Bucket()
  if (!bucket) return null
  const object = await bucket.get(key).catch(() => null)
  if (!object) return null
  return {
    body: object.body ?? null,
    contentType: object.httpMetadata?.contentType ?? 'image/jpeg',
    etag: object.httpEtag,
  }
}

export async function storeMedia(key: string, data: ArrayBuffer, contentType: string): Promise<void> {
  const bucket = r2Bucket()
  if (!bucket) return
  await bucket.put(key, data, { httpMetadata: { contentType } })
}

export async function mirrorMediaItem(r2Path: string): Promise<boolean> {
  const key = r2Path.startsWith('/r2/') ? r2Path.slice(4) : r2Path
  if (!isValidMediaKey(key)) return false
  const bucket = r2Bucket()
  if (!bucket) return false
  if (await hasCachedMedia(key)) return true
  const origin = keyToOrigin(key)
  if (!origin) return false
  try {
    const { contentType, bytes } = await fetchRemoteMedia(origin)
    await storeMedia(key, bytes, contentType)
    return true
  } catch {
    return false
  }
}

export async function mirrorAnimeMedia(posterPath: string | null, characters: { imageUrl?: string, voiceActor?: { imageUrl?: string } }[]): Promise<void> {
  const tasks: string[] = []
  if (posterPath && posterPath.startsWith('/r2/')) tasks.push(posterPath)
  for (const c of characters) {
    if (c.imageUrl && c.imageUrl.startsWith('/r2/')) tasks.push(c.imageUrl)
    if (c.voiceActor?.imageUrl && c.voiceActor.imageUrl.startsWith('/r2/')) tasks.push(c.voiceActor.imageUrl)
  }
  if (tasks.length === 0) return
  await Promise.all(tasks.map(item => mirrorMediaItem(item)))
}

export async function fetchRemoteMedia(url: string): Promise<{ contentType: string, bytes: ArrayBuffer }> {
  const response = await fetch(url, {
    headers: getSpoofHeaders(MAL_REFERER, 'cors'),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') ?? 'image/jpeg'
  return { contentType, bytes: await response.arrayBuffer() }
}

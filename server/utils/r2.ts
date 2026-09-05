import { getSpoofHeaders } from './spoof'

const MAL_CDN = 'https://cdn.myanimelist.net/images/'
const MAL_REFERER = 'https://myanimelist.net/'
const FETCH_TIMEOUT_MS = 15000

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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
  const env = (globalThis as { __env__?: { R2?: R2BucketLike; POSTERS?: R2BucketLike } }).__env__
  return env?.R2 ?? env?.POSTERS ?? null
}

export const isR2Available = () => r2Bucket() !== null

/**
 * Valid media key pattern: <folder>/<subfolder>/<file>
 * e.g. posters/1506/117717.jpg, characters/14/587281.webp, voiceactors/1/87350.jpg
 */
export function isValidMediaKey(key: string): boolean {
  if (!key || key.includes('..')) return false
  return /^(posters|characters|voiceactors)\/[a-zA-Z0-9_/.-]+$/i.test(key)
}

/**
 * Normalizes full MAL URL or relative path into a clean `/r2/<key>` format.
 */
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

export function keyToOrigin(key: string): string | null {
  if (key.startsWith('posters/')) {
    return `${MAL_CDN}anime/${key.slice(8)}`
  }
  if (key.startsWith('characters/') || key.startsWith('voiceactors/')) {
    return `${MAL_CDN}${key}`
  }
  return null
}

export interface MediaObject {
  body: ReadableStream | null
  contentType: string
  etag?: string
}

export async function getCachedMedia(key: string): Promise<MediaObject | null> {
  const bucket = r2Bucket()
  if (!bucket) return null

  // 1. Direct key
  let object = await bucket.head(key).then(h => h ? bucket.get(key) : null).catch(() => null)

  // 2. Legacy fallback keys
  if (!object && key.startsWith('posters/')) {
    const sub = key.slice(8)
    object = await bucket.get(`cdn.myanimelist.net/images/anime/${sub}`)
    if (!object) {
      object = await bucket.get(sub)
    }
  }

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

export async function fetchRemoteMedia(
  url: string,
  attempt = 0,
): Promise<{ contentType: string, bytes: ArrayBuffer }> {
  const response = await fetch(url, {
    headers: getSpoofHeaders(MAL_REFERER, 'cors'),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) {
    if (attempt < 2 && (response.status === 403 || response.status === 429 || response.status >= 500)) {
      await sleep(500 * (attempt + 1))
      return fetchRemoteMedia(url, attempt + 1)
    }
    throw new Error(`HTTP ${response.status}`)
  }
  const contentType = response.headers.get('content-type') ?? 'image/jpeg'
  return { contentType, bytes: await response.arrayBuffer() }
}

import { getSpoofHeaders } from './spoof'

const MAL_CDN_PREFIX = 'https://cdn.myanimelist.net/images/anime/'
const MAL_REFERER = 'https://myanimelist.net/'
const POSTER_FETCH_TIMEOUT_MS = 15000

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

function posterBucket(): R2BucketLike | null {
  const env = (globalThis as { __env__?: { POSTERS?: R2BucketLike } }).__env__
  return env?.POSTERS ?? null
}

/** Validate that a key matches the pattern `<id>/<file>.jpg` without directory traversal. */
export function isPosterKey(key: string): boolean {
  if (!key || key.includes('..')) return false
  return /^\d+\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(key)
}

/**
 * Extract short R2 key `<folder>/<filename>` from a full MyAnimeList poster URL.
 * e.g. "https://cdn.myanimelist.net/images/anime/1319/158376.jpg" -> "1319/158376.jpg"
 */
export function posterKey(value: string): string | null {
  if (!value.startsWith(MAL_CDN_PREFIX)) return null
  const sub = value.slice(MAL_CDN_PREFIX.length)
  return isPosterKey(sub) ? sub : null
}

/**
 * Map a stored poster value to the clean `/posters/<key>` URL.
 * - If already starts with `/posters/` or `/img/posters/`, normalizes it.
 * - If remote MAL URL, rewrites to `/posters/<id>/<file>.ext`.
 * - Empty or unknown formats pass through unchanged.
 */
export function posterSrc(value: string | null | undefined): string {
  if (!value) return ''
  if (value.startsWith('/posters/')) return value
  if (value.startsWith('/img/posters/cdn.myanimelist.net/images/anime/')) {
    return `/posters/${value.slice('/img/posters/cdn.myanimelist.net/images/anime/'.length)}`
  }
  const key = posterKey(value)
  return key ? `/posters/${key}` : value
}

export function postersEnabled(): boolean {
  return posterBucket() !== null
}

export interface PosterObject {
  body: ReadableStream | null
  contentType: string
  etag?: string
}

/**
 * Lookup a poster from R2. Checks both the clean short key (`1319/158376.jpg`)
 * and the legacy long key (`cdn.myanimelist.net/images/anime/1319/158376.jpg`).
 */
export async function getCachedPoster(shortKey: string): Promise<PosterObject | null> {
  const bucket = posterBucket()
  if (!bucket) return null
  let object = await bucket.get(shortKey)
  if (!object) {
    object = await bucket.get(`cdn.myanimelist.net/images/anime/${shortKey}`)
  }
  if (!object) return null
  return {
    body: object.body ?? null,
    contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
    etag: object.httpEtag,
  }
}

export async function storePoster(key: string, data: ArrayBuffer, contentType: string): Promise<void> {
  const bucket = posterBucket()
  if (!bucket) return
  await bucket.put(key, data, { httpMetadata: { contentType } })
}

/** Origin URL a short key maps back to. */
export function posterOrigin(shortKey: string): string {
  return `${MAL_CDN_PREFIX}${shortKey}`
}

/**
 * Fetch a remote poster with browser-like headers. Retries on throttling.
 */
export async function fetchPosterBytes(
  url: string,
  attempt = 0,
): Promise<{ contentType: string, bytes: ArrayBuffer }> {
  const response = await fetch(url, {
    headers: getSpoofHeaders(MAL_REFERER, 'cors'),
    signal: AbortSignal.timeout(POSTER_FETCH_TIMEOUT_MS),
  })
  if (!response.ok) {
    if (attempt < 3 && (response.status === 403 || response.status === 429 || response.status >= 500)) {
      await sleep(1500 * (attempt + 1) + Math.random() * 1500)
      return fetchPosterBytes(url, attempt + 1)
    }
    throw new Error(`upstream HTTP ${response.status}`)
  }
  const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
  if (!contentType.startsWith('image/')) throw new Error(`unexpected content-type ${contentType}`)
  return { contentType, bytes: await response.arrayBuffer() }
}

import { getSpoofHeaders } from './spoof'

const POSTER_HOSTS = new Set(['cdn.myanimelist.net'])
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

function posterHost(value: string): string | null {
  try {
    return new URL(value).hostname
  }
  catch {
    return null
  }
}

/** True for remote poster URLs we mirror into R2 (allow-list guards the proxy route against SSRF). */
export function isPosterUrl(value: string): boolean {
  return POSTER_HOSTS.has(posterHost(value) ?? '')
}

/** True when the cache-route key belongs to a mirrored poster host. */
export function isPosterKey(key: string): boolean {
  const slash = key.indexOf('/')
  if (slash <= 0) return false
  return POSTER_HOSTS.has(key.slice(0, slash)) && !key.includes('..')
}

/** R2 object key for a mirrored poster URL, or null when the URL is not mirrorable. */
export function posterKey(value: string): string | null {
  if (!isPosterUrl(value)) return null
  const url = new URL(value)
  return `${url.hostname}${url.pathname}`
}

/**
 * Map a stored poster value to the local R2-backed cache route. Remote,
 * mirrorable posters are rewritten to `/img/posters/<key>`; anything else
 * (empty, already local, non-mirrored host) is returned unchanged.
 */
export function posterSrc(value: string | null | undefined): string {
  if (!value) return ''
  const key = posterKey(value)
  return key ? `/img/posters/${key}` : value
}

export function postersEnabled(): boolean {
  return posterBucket() !== null
}

export async function hasCachedPoster(key: string): Promise<boolean> {
  const bucket = posterBucket()
  if (!bucket) return false
  const object = await bucket.head(key)
  return object !== null
}

export interface PosterObject {
  body: ReadableStream | null
  contentType: string
  etag?: string
}

export async function getCachedPoster(key: string): Promise<PosterObject | null> {
  const bucket = posterBucket()
  if (!bucket) return null
  const object = await bucket.get(key)
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

/** Origin URL a cache-route key maps back to. */
export function posterOrigin(key: string): string {
  return `https://${key}`
}

/**
 * Fetch a remote poster with browser-like headers. Retries a few times with
 * backoff on throttling (403/429) and upstream errors, since MAL's CDN limits
 * bursts from worker egress IPs.
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

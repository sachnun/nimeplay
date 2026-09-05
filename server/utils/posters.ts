const POSTER_HOSTS = new Set(['cdn.myanimelist.net'])

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

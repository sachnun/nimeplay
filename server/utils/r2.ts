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

export async function hasCachedMedia(key: string): Promise<boolean> {
  const bucket = r2Bucket()
  if (!bucket) return false
  const head = await bucket.head(key).catch(() => null)
  if (head) return true
  if (key.startsWith('posters/')) {
    const sub = key.slice(8)
    const leg1 = await bucket.head(`cdn.myanimelist.net/images/anime/${sub}`).catch(() => null)
    if (leg1) return true
    const leg2 = await bucket.head(sub).catch(() => null)
    if (leg2) return true
  }
  return false
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

const MIRROR_CONCURRENCY = 15

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
  let idx = 0
  const workers = Array.from({ length: Math.min(MIRROR_CONCURRENCY, tasks.length) }, async () => {
    while (idx < tasks.length) {
      const item = tasks[idx++]
      if (!item) break
      await mirrorMediaItem(item)
    }
  })
  await Promise.all(workers)
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

export const MAX_IMAGE_BYTES = 5120

export type ImageFormat = 'avif' | 'webp' | 'jpeg'

export interface ImageTransform {
  width: number
  quality: number
  format: ImageFormat
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

export function imageContentType(format: ImageFormat): string {
  if (format === 'avif') return 'image/avif'
  if (format === 'webp') return 'image/webp'
  return 'image/jpeg'
}

export function parseImageTransform(query: Record<string, unknown>): ImageTransform | null {
  const hasW = query.w !== undefined && query.w !== ''
  const hasQ = query.q !== undefined && query.q !== ''
  const hasFm = query.fm !== undefined && query.fm !== ''
  if (!hasW && !hasQ && !hasFm) return null
  const rawFm = typeof query.fm === 'string' ? query.fm.toLowerCase() : ''
  const format: ImageFormat = rawFm === 'webp' ? 'webp' : rawFm === 'jpeg' || rawFm === 'jpg' ? 'jpeg' : 'avif'
  return {
    width: clampInt(query.w, 16, 400, 200),
    quality: clampInt(query.q, 10, 80, 30),
    format,
  }
}

export function imageVariantKey(key: string, t: ImageTransform): string {
  return `__t__/w${t.width}-q${t.quality}-${t.format}/${key}`
}

export async function getCachedVariant(variantKey: string): Promise<MediaObject | null> {
  const bucket = r2Bucket()
  if (!bucket) return null
  const object = await bucket.get(variantKey).catch(() => null)
  if (!object) return null
  return {
    body: object.body ?? null,
    contentType: object.httpMetadata?.contentType ?? 'image/avif',
    etag: object.httpEtag,
  }
}

export async function storeVariant(variantKey: string, data: ArrayBuffer, contentType: string): Promise<void> {
  const bucket = r2Bucket()
  if (!bucket) return
  await bucket.put(variantKey, data, { httpMetadata: { contentType } })
}

async function fetchWithImageResize(origin: string, t: ImageTransform): Promise<{ contentType: string, bytes: ArrayBuffer }> {
  const options = {
    headers: getSpoofHeaders(MAL_REFERER, 'cors'),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cf: {
      image: {
        width: t.width,
        quality: t.quality,
        format: t.format,
        fit: 'cover',
        metadata: 'none',
      },
    },
  } as unknown as RequestInit
  const response = await fetch(origin, options)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') ?? imageContentType(t.format)
  return { contentType, bytes: await response.arrayBuffer() }
}

export async function fetchTransformedMedia(origin: string, t: ImageTransform): Promise<{ contentType: string, bytes: ArrayBuffer }> {
  let width = t.width
  let quality = t.quality
  let last: { contentType: string, bytes: ArrayBuffer } | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const current: ImageTransform = { width, quality, format: t.format }
    const result = await fetchWithImageResize(origin, current)
    last = result
    if (result.bytes.byteLength <= MAX_IMAGE_BYTES) return result
    quality = Math.max(10, quality - 10)
    width = Math.max(96, Math.round(width * 0.8))
    if (attempt === 2 && last) return last
  }
  if (last) return last
  throw new Error('Transform failed')
}

import { AwsClient } from 'aws4fetch'
import { cloudflareEnv } from './env'
import { getSpoofHeaders } from './spoof'

const MAL_CDN = 'https://cdn.myanimelist.net/images/'
const MAL_REFERER = 'https://myanimelist.net/'
const FETCH_TIMEOUT_MS = 15000

let s3: AwsClient | null | undefined
let bucketUrl: string | null | undefined

function mediaClient(): AwsClient | null {
  if (s3 !== undefined) return s3
  const env = cloudflareEnv()
  const accessKeyId = env.AWS_ACCESS_KEY_ID
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY
  const endpoint = env.AWS_ENDPOINT_URL_S3
  if (typeof accessKeyId !== 'string' || typeof secretAccessKey !== 'string' || typeof endpoint !== 'string') {
    s3 = null
    return s3
  }
  bucketUrl = `${endpoint.replace(/\/$/, '')}/${typeof env.MEDIA_BUCKET === 'string' ? env.MEDIA_BUCKET : 'nimeplay'}`
  s3 = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region: typeof env.AWS_REGION === 'string' ? env.AWS_REGION : 'us-east-1',
    service: 's3',
  })
  return s3
}

function objectUrl(key: string): string | null {
  mediaClient()
  return bucketUrl ? `${bucketUrl}/${key}` : null
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

export function toAbsoluteUrl(path: string | null | undefined, origin?: string): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (!path.startsWith('/r2/')) return path
  if (!origin) return path
  return `${origin}${path}`
}

export function absolutePosterSrc(value: string | null | undefined, origin?: string): string {
  return toAbsoluteUrl(posterSrc(value), origin)
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
  const client = mediaClient()
  const url = objectUrl(key)
  if (!client || !url) return false
  const res = await client.fetch(url, { method: 'HEAD' }).catch(() => null)
  return !!res && res.ok
}

export interface MediaObject {
  body: ReadableStream | null
  contentType: string
  etag?: string
}

export async function getCachedMedia(key: string): Promise<MediaObject | null> {
  const client = mediaClient()
  const url = objectUrl(key)
  if (!client || !url) return null
  const res = await client.fetch(url).catch(() => null)
  if (!res || !res.ok) return null
  return {
    body: res.body,
    contentType: res.headers.get('content-type') ?? 'image/jpeg',
    etag: res.headers.get('etag') ?? undefined,
  }
}

export async function storeMedia(key: string, data: ArrayBuffer, contentType: string): Promise<void> {
  const client = mediaClient()
  const url = objectUrl(key)
  if (!client || !url) return
  await client.fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' },
    body: data,
  })
}

export async function mirrorMediaItem(r2Path: string): Promise<boolean> {
  const key = r2Path.startsWith('/r2/') ? r2Path.slice(4) : r2Path
  if (!isValidMediaKey(key)) return false
  if (!mediaClient()) return false
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

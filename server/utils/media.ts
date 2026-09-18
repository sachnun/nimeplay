import { AwsClient } from 'aws4fetch'
import { cloudflareEnv } from './env'
import { getSpoofHeaders } from './spoof'

const MEDIA_CDN = 'https://cdn.myanimelist.net/images/'
const MAL_REFERER = 'https://myanimelist.net/'
const FETCH_TIMEOUT_MS = 15000

type MediaType = 'posters' | 'characters' | 'voiceactors'

let s3: AwsClient | null | undefined
let base: string | null | undefined

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
  const bucket = typeof env.MEDIA_BUCKET === 'string' ? env.MEDIA_BUCKET : 'nimeplay'
  base = `${endpoint.replace(/\/$/, '')}/${bucket}`
  s3 = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region: typeof env.AWS_REGION === 'string' ? env.AWS_REGION : 'us-east-1',
    service: 's3',
  })
  return s3
}

function mediaBase(): string | null {
  mediaClient()
  return base ?? null
}

function objectUrl(key: string): string | null {
  const root = mediaBase()
  return root ? `${root}/${key}` : null
}

export function mediaKey(value: string, type: MediaType = 'posters'): string | null {
  if (value.startsWith('/r2/')) return value.slice(4)
  if (value.startsWith('/posters/')) return `posters/${value.slice(9)}`
  if (value.startsWith('/characters/')) return `characters/${value.slice(12)}`
  if (value.startsWith('/voiceactors/')) return `voiceactors/${value.slice(13)}`
  if (value.startsWith('/img/posters/cdn.myanimelist.net/images/anime/')) {
    return `posters/${value.slice('/img/posters/cdn.myanimelist.net/images/anime/'.length)}`
  }
  const root = mediaBase()
  if (root && value.startsWith(`${root}/`)) return value.slice(root.length + 1)
  const prefix = `${MEDIA_CDN}${type === 'posters' ? 'anime/' : `${type}/`}`
  if (value.startsWith(prefix)) {
    const clean = value.split('?')[0] ?? ''
    return `${type}/${clean.slice(prefix.length)}`
  }
  return null
}

export function mediaPublicUrl(key: string): string {
  if (key.startsWith('posters/')) {
    const root = mediaBase()
    return root ? `${root}/${key}` : `${MEDIA_CDN}anime/${key.slice(8)}`
  }
  return `${MEDIA_CDN}${key}`
}

export function toR2Url(url: string | null | undefined, type: MediaType): string {
  if (!url) return ''
  if (url.startsWith(MEDIA_CDN)) {
    const key = mediaKey(url, type)
    return key ? mediaPublicUrl(key) : url
  }
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const key = mediaKey(url, type)
  return key ? mediaPublicUrl(key) : url
}

export function posterSrc(value: string | null | undefined): string {
  return toR2Url(value, 'posters')
}

export function characterSrc(value: string | null | undefined, type: 'characters' | 'voiceactors'): string {
  return toR2Url(value, type)
}

export function toAbsoluteUrl(path: string | null | undefined, origin?: string): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const key = mediaKey(path)
  if (key) return mediaPublicUrl(key)
  if (!path.startsWith('/r2/')) return path
  return origin ? `${origin}${path}` : path
}

export function keyToOrigin(key: string): string | null {
  if (key.startsWith('posters/')) return `${MEDIA_CDN}anime/${key.slice(8)}`
  if (key.startsWith('characters/') || key.startsWith('voiceactors/')) return `${MEDIA_CDN}${key}`
  return null
}

export async function mirrorPoster(value: string | null | undefined): Promise<void> {
  if (!value) return
  const key = mediaKey(value)
  if (!key || !key.startsWith('posters/')) return
  const origin = keyToOrigin(key)
  const client = mediaClient()
  const url = objectUrl(key)
  if (!origin || !client || !url) return
  try {
    const { contentType, bytes } = await fetchRemoteMedia(origin)
    await client.fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' },
      body: bytes,
    })
  } catch {}
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

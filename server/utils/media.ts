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

function objectUrl(key: string): string | null {
  mediaClient()
  return base ? `${base}/${key}` : null
}

export function isValidMediaKey(key: string): boolean {
  if (!key || key.includes('..')) return false
  return /^(posters|characters|voiceactors)\/[a-zA-Z0-9_/.-]+$/i.test(key)
}

export function mediaKey(value: string, type: MediaType = 'posters'): string | null {
  mediaClient()
  if (/^(posters|characters|voiceactors)\//.test(value)) return value
  if (value.startsWith('/media/')) return value.slice(7)
  if (base && value.startsWith(`${base}/`)) return value.slice(base.length + 1)
  const prefix = `${MEDIA_CDN}${type === 'posters' ? 'anime/' : `${type}/`}`
  if (value.startsWith(prefix)) {
    const clean = value.split('?')[0] ?? ''
    return `${type}/${clean.slice(prefix.length)}`
  }
  return null
}

export function mediaUrl(url: string | null | undefined, type: MediaType): string {
  if (!url) return ''
  const key = mediaKey(url, type)
  return key ? `/media/${key}` : url
}

export function posterSrc(value: string | null | undefined): string {
  return mediaUrl(value, 'posters')
}

export function toAbsoluteUrl(path: string | null | undefined, origin?: string): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (!path.startsWith('/media/')) return path
  if (!origin) return path
  return `${origin}${path}`
}

export function keyToOrigin(key: string): string | null {
  if (key.startsWith('posters/')) return `${MEDIA_CDN}anime/${key.slice(8)}`
  if (key.startsWith('characters/') || key.startsWith('voiceactors/')) return `${MEDIA_CDN}${key}`
  return null
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

export async function fetchRemoteMedia(url: string): Promise<{ contentType: string, bytes: ArrayBuffer }> {
  const response = await fetch(url, {
    headers: getSpoofHeaders(MAL_REFERER, 'cors'),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') ?? 'image/jpeg'
  return { contentType, bytes: await response.arrayBuffer() }
}

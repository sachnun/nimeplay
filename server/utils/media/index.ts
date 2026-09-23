import { AwsClient } from 'aws4fetch'
import { cloudflareEnv } from '../env'

const FETCH_TIMEOUT_MS = 15000
const KEY_BYTES = 16

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

export function mediaKey(value: string): string | null {
  mediaClient()
  if (/^(posters|characters|voiceactors)\//.test(value)) return value
  if (value.startsWith('/media/')) return value.slice(7)
  if (base && value.startsWith(`${base}/`)) return value.slice(base.length + 1)
  return null
}

export function mediaUrl(url: string | null | undefined): string {
  if (!url) return ''
  const key = mediaKey(url)
  return key ? `/media/${key}` : url
}

export function posterSrc(value: string | null | undefined): string {
  return mediaUrl(value)
}

export function toAbsoluteUrl(path: string | null | undefined, origin?: string): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (!path.startsWith('/media/')) return path
  if (!origin) return path
  return `${origin}${path}`
}

export interface MediaRef {
  key: string
  sourceUrl: string
}

function randomKey(type: MediaType): string {
  const bytes = new Uint8Array(KEY_BYTES)
  crypto.getRandomValues(bytes)
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return `${type}/${hex}.webp`
}

export function mediaRef(url: string | null | undefined, type: MediaType): MediaRef | null {
  if (!url || !/^https?:\/\//.test(url)) return null
  return { key: randomKey(type), sourceUrl: url }
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
  const res = await client.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }).catch(() => null)
  if (!res || !res.ok) return null
  return {
    body: res.body,
    contentType: res.headers.get('content-type') ?? 'image/jpeg',
    etag: res.headers.get('etag') ?? undefined,
  }
}

export async function putMedia(key: string, data: ArrayBuffer, contentType: string): Promise<void> {
  const client = mediaClient()
  const url = objectUrl(key)
  if (!client || !url) return
  await client.fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' },
    body: data,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
}

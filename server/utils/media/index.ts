import { AwsClient } from 'aws4fetch'
import { mediaConfig } from './config'

const FETCH_TIMEOUT_MS = 15000
const KEY_BYTES = 16

type MediaType = 'posters' | 'characters' | 'voiceactors'

let s3: AwsClient | null = null
let base: string | null = null

function mediaClient(): AwsClient | null {
  if (s3) return s3
  const config = mediaConfig()
  if (!config.accessKeyId || !config.secretAccessKey || !config.endpoint) return null
  base = `${config.endpoint.replace(/\/$/, '')}/${config.bucket}`
  s3 = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region || 'us-east-1',
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

function mediaKey(value: string): string | null {
  mediaClient()
  if (/^(posters|characters|voiceactors)\//.test(value)) return value
  if (value.startsWith('/media/')) return value.slice(7)
  if (base && value.startsWith(`${base}/`)) return value.slice(base.length + 1)
  return null
}

function mediaUrl(url: string | null | undefined): string {
  if (!url) return ''
  const key = mediaKey(url)
  return key ? `/media/${key}` : url
}

export function posterSrc(value: string | null | undefined): string {
  return mediaUrl(value)
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

interface MediaObject {
  body: ReadableStream | null
  contentType: string
  etag?: string
}

export async function getCachedMedia(key: string): Promise<MediaObject | null> {
  const client = mediaClient()
  const url = objectUrl(key)
  if (!client || !url) return null
  const res = await client.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }).catch(() => null)
  if (!res?.ok) return null
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

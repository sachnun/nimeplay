import { asHttpUrl, isPlaceholderStreamUrl, VIDEO_UA } from './hosts'
import { md5Hex } from '../crypto/md5'

const DATAS_RE = /const\s+datas\s*=\s*"([^"]+)"/
const ABYSS_REFERER = 'https://abyss.to/'

interface HydraxDatas {
  user_id?: number
  slug?: string
  md5_id?: number
  media?: string
}

interface HydraxSource {
  res_id?: number
  size?: number
  sub?: string
  label?: string
  status?: boolean
}

interface HydraxMedia {
  mp4?: {
    sources?: HydraxSource[]
    domains?: string[]
  }
}

export function isHydrax(url: string): boolean {
  const lower = url.toLowerCase()
  return lower.includes('abyssplayer.')
    || lower.includes('abysscdn.')
    || lower.includes('abyss.to')
    || lower.includes('hydrax')
}

function charCodeBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length)
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff
  return bytes
}

function numberKeyBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length)
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    bytes[i] = code >= 48 && code <= 57 ? code - 48 : code
  }
  return bytes
}

function hexKey(input: Uint8Array): Uint8Array {
  return new TextEncoder().encode(md5Hex(input))
}

async function aesCtr(key: Uint8Array, data: Uint8Array, mode: 'encrypt' | 'decrypt'): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-CTR', false, [mode])
  const algorithm: AesCtrParams = { name: 'AES-CTR', counter: key.slice(0, 16) as BufferSource, length: 128 }
  const result = mode === 'encrypt'
    ? await crypto.subtle.encrypt(algorithm, cryptoKey, data as BufferSource)
    : await crypto.subtle.decrypt(algorithm, cryptoKey, data as BufferSource)
  return new Uint8Array(result)
}

function toBinary(value: Uint8Array): string {
  let out = ''
  for (const byte of value) out += String.fromCharCode(byte)
  return out
}

function doubleBase64(value: Uint8Array): string {
  const first = btoa(toBinary(value)).replace(/=/g, '')
  return btoa(first).replace(/=/g, '')
}

function qualityRank(source: HydraxSource): number {
  if (source.status === false) return -1
  const match = String(source.label ?? '').match(/(\d{3,4})/)
  return match ? Number(match[1]) : 0
}

function pickSource(sources: HydraxSource[]): HydraxSource | null {
  return [...sources]
    .filter(source => typeof source.res_id === 'number' && typeof source.size === 'number' && source.sub)
    .sort((a, b) => qualityRank(b) - qualityRank(a) || (b.size ?? 0) - (a.size ?? 0))[0] ?? null
}

function hostFor(media: HydraxMedia, sub: string): string {
  const domains = media.mp4?.domains
  if (Array.isArray(domains)) {
    const match = domains.find(domain => domain.includes(sub))
    if (match) return match
  }
  return `${sub}.sssrr.org`
}

async function soraUrl(datas: HydraxDatas, media: HydraxMedia, source: HydraxSource): Promise<string | null> {
  const key = hexKey(numberKeyBytes(String(source.size)))
  const path = `/mp4/${datas.md5_id}/${source.res_id}/${source.size}?v=${datas.slug}`
  const token = doubleBase64(await aesCtr(key, new TextEncoder().encode(path), 'encrypt'))
  return asHttpUrl(`https://${hostFor(media, source.sub!)}/sora/${source.size}/${token}`)
}

async function followToFinal(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { Referer: ABYSS_REFERER, 'User-Agent': VIDEO_UA, Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(8000),
    })
    void res.body?.cancel()
    if (!res.ok && res.status !== 206) return null
    return asHttpUrl(res.url) ?? url
  }
  catch {
    return null
  }
}

export async function extractHydrax(_embedUrl: string, html: string): Promise<string | null> {
  const encoded = html.match(DATAS_RE)?.[1]
  if (!encoded) return null

  let datas: HydraxDatas
  try {
    datas = JSON.parse(atob(encoded)) as HydraxDatas
  }
  catch {
    return null
  }
  if (!datas.user_id || !datas.slug || !datas.md5_id || typeof datas.media !== 'string') return null

  const mediaKey = hexKey(new TextEncoder().encode(`${datas.user_id}:${datas.slug}:${datas.md5_id}`))
  let media: HydraxMedia
  try {
    const plain = await aesCtr(mediaKey, charCodeBytes(datas.media), 'decrypt')
    media = JSON.parse(new TextDecoder().decode(plain)) as HydraxMedia
  }
  catch {
    return null
  }

  const sources = media.mp4?.sources
  if (!Array.isArray(sources)) return null
  const source = pickSource(sources)
  if (!source) return null

  const candidate = await soraUrl(datas, media, source)
  if (!candidate || isPlaceholderStreamUrl(candidate)) return null

  const final = await followToFinal(candidate)
  if (!final || isPlaceholderStreamUrl(final)) return candidate
  return final
}

import { readStreamSecret } from './config'

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000
const IV_LENGTH = 12

type TokenPayload = { u: string; e: number; h?: Record<string, string>; k?: string }

let cachedKey: Promise<CryptoKey> | null = null

function streamSecret(): string {
  const value = readStreamSecret()
  if (value.length < 32) throw new Error('STREAM_SECRET is not configured')
  return value
}

function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey
  const encoded = new TextEncoder().encode(streamSecret())
  cachedKey = crypto.subtle
    .digest('SHA-256', encoded)
    .then(digest => crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']))
  return cachedKey
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function toBase64Url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    out += BASE64URL[b0 >> 2]
    out += BASE64URL[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]
    if (b1 === undefined) break
    out += BASE64URL[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]
    if (b2 === undefined) break
    out += BASE64URL[b2 & 63]
  }
  return out
}

export function fromBase64Url(value: string): Uint8Array {
  const bytes = new Uint8Array(Math.floor((value.length * 3) / 4))
  let buffer = 0
  let bits = 0
  let length = 0
  for (const char of value) {
    const index = BASE64URL.indexOf(char)
    if (index === -1) continue
    buffer = (buffer << 6) | index
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[length++] = (buffer >> bits) & 0xff
    }
  }
  return bytes.subarray(0, length)
}

export async function sealStreamToken(
  url: string,
  ttlMs?: number,
  headers?: Record<string, string>,
  megaKey?: string,
  now: number = Date.now(),
): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const payload: TokenPayload = { u: url, e: ttlMs ? now + ttlMs : 0 }
  if (headers && Object.keys(headers).length > 0) payload.h = headers
  if (megaKey) payload.k = megaKey
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload))),
  )
  const sealed = new Uint8Array(IV_LENGTH + ciphertext.length)
  sealed.set(iv)
  sealed.set(ciphertext, IV_LENGTH)
  return toBase64Url(sealed)
}

async function decodeToken(token: string, now: number = Date.now()): Promise<TokenPayload | null> {
  try {
    const sealed = fromBase64Url(token)
    if (sealed.length <= IV_LENGTH) return null
    const key = await getKey()
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.slice(0, IV_LENGTH) },
      key,
      sealed.slice(IV_LENGTH),
    )
    const payload = JSON.parse(new TextDecoder().decode(plaintext)) as TokenPayload
    if (!payload.u || typeof payload.e !== 'number') return null
    if (payload.e !== 0 && payload.e < now) return null
    return payload
  } catch {
    return null
  }
}

export async function openStreamToken(token: string, now?: number): Promise<string | null> {
  return (await decodeToken(token, now))?.u ?? null
}

export async function openStreamRequest(
  token: string,
  now?: number,
): Promise<{ url: string; headers: Record<string, string>; megaKey?: string } | null> {
  const payload = await decodeToken(token, now)
  if (!payload) return null
  return { url: payload.u, headers: payload.h ?? {}, megaKey: payload.k }
}

export function proxiedStreamPath(token: string): string {
  return `/api/stream?t=${token}`
}

export async function sealedStreamUrl(rawUrl: string, baseUrl?: string): Promise<string> {
  const absolute = new URL(rawUrl, baseUrl).toString()
  return proxiedStreamPath(await sealStreamToken(absolute, TOKEN_TTL_MS))
}

export async function rewriteHlsPlaylist(
  text: string,
  baseUrl: string,
  seal: (rawUrl: string, baseUrl?: string) => Promise<string> = sealedStreamUrl,
): Promise<string> {
  const lines = text.split('\n').map(async line => {
    const trimmed = line.trim()
    if (!trimmed) return line
    if (trimmed.startsWith('#')) {
      const uris = [...line.matchAll(/URI="([^"]+)"/g)].map(match => match[1] ?? '')
      if (uris.length === 0) return line
      const sealed = await Promise.all(uris.map(uri => seal(uri, baseUrl)))
      let index = 0
      return line.replace(/URI="([^"]+)"/g, () => `URI="${sealed[index++] ?? ''}"`)
    }
    return seal(trimmed, baseUrl)
  })
  return (await Promise.all(lines)).join('\n')
}

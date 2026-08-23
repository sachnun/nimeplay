const TOKEN_TTL_MS = 12 * 60 * 60 * 1000
const IV_LENGTH = 12
// Static app-wide key material; tokens are opaque to clients and expire.
const SECRET = 'nimeplay::v1::7Kp3wQz9rXe2VmYs8NbT4cHd6FjUgLa0'

type TokenPayload = { u: string; e: number }

let cachedKey: Promise<CryptoKey> | null = null

function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey
  const encoded = new TextEncoder().encode(SECRET)
  cachedKey = crypto.subtle
    .digest('SHA-256', encoded)
    .then((digest) => crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']))
  return cachedKey
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export async function sealStreamToken(url: string, ttlMs?: number): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const payload = new TextEncoder().encode(JSON.stringify({ u: url, e: ttlMs ? Date.now() + ttlMs : 0 } satisfies TokenPayload))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload))
  const sealed = new Uint8Array(IV_LENGTH + ciphertext.length)
  sealed.set(iv)
  sealed.set(ciphertext, IV_LENGTH)
  return toBase64Url(sealed)
}

export async function openStreamToken(token: string): Promise<string | null> {
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
    if (payload.e !== 0 && payload.e < Date.now()) return null
    return payload.u
  } catch {
    return null
  }
}

export function proxiedStreamPath(origin: string, token: string): string {
  return `${origin}/api/stream?t=${token}`
}

export async function sealedStreamUrl(origin: string, rawUrl: string, baseUrl?: string): Promise<string> {
  const absolute = new URL(rawUrl, baseUrl).toString()
  return proxiedStreamPath(origin, await sealStreamToken(absolute, TOKEN_TTL_MS))
}

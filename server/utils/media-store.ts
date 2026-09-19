import { optimizeImage } from './image'
import { getSpoofHeaders } from './spoof'
import { plainGetBinary } from './plain-fetch'
import { putMedia } from './media'

const MAL_REFERER = 'https://myanimelist.net/'
const FETCH_TIMEOUT_MS = 15000
const FETCH_ATTEMPTS = 3
const POSTER_WIDTH = 256
const AVATAR_SIZE = 112

export async function storeMedia(key: string, data: ArrayBuffer, contentType: string): Promise<void> {
  const poster = key.startsWith('posters/')
  const encoded = await optimizeImage(data, contentType, poster ? POSTER_WIDTH : AVATAR_SIZE, !poster)
  await putMedia(key, encoded.bytes, encoded.contentType)
}

export async function fetchRemoteMedia(url: string): Promise<{ contentType: string, bytes: ArrayBuffer }> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchImage(url)
    }
    catch (error) {
      const permanent = error instanceof Error && /^HTTP 4\d\d/.test(error.message)
      if (permanent || attempt >= FETCH_ATTEMPTS) throw error
      await new Promise(resolve => setTimeout(resolve, 500 * attempt))
    }
  }
}

async function fetchImage(url: string): Promise<{ contentType: string, bytes: ArrayBuffer }> {
  const direct = await plainGetBinary(url, { headers: { referer: MAL_REFERER }, timeoutMs: FETCH_TIMEOUT_MS })
  if (direct && direct.status >= 200 && direct.status < 300) {
    return { contentType: direct.contentType, bytes: direct.bytes.buffer as ArrayBuffer }
  }
  const response = await fetch(url, {
    headers: getSpoofHeaders(MAL_REFERER, 'cors'),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') ?? 'image/jpeg'
  return { contentType, bytes: await response.arrayBuffer() }
}

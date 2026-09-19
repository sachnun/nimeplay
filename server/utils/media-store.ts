import { optimizeImage } from './image'
import { getSpoofHeaders } from './spoof'
import { putMedia } from './media'

const ANILIST_CDN = 'https://s4.anilist.co/'
const UNROXY = 'https://unroxy.koyeb.app/'
const MAL_REFERER = 'https://myanimelist.net/'
const FETCH_TIMEOUT_MS = 15000
const POSTER_WIDTH = 256
const AVATAR_SIZE = 112

export async function storeMedia(key: string, data: ArrayBuffer, contentType: string): Promise<void> {
  const poster = key.startsWith('posters/')
  const encoded = await optimizeImage(data, contentType, poster ? POSTER_WIDTH : AVATAR_SIZE, !poster)
  await putMedia(key, encoded.bytes, encoded.contentType)
}

export async function fetchRemoteMedia(url: string): Promise<{ contentType: string, bytes: ArrayBuffer }> {
  const target = url.startsWith(ANILIST_CDN) ? `${UNROXY}${url}` : url
  const response = await fetch(target, {
    headers: getSpoofHeaders(MAL_REFERER, 'cors'),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') ?? 'image/jpeg'
  return { contentType, bytes: await response.arrayBuffer() }
}

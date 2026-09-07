defineRouteMeta({
  openAPI: {
    tags: ['Stream'],
    summary: 'Proxy stream by token',
    description: 'Resolves a sealed stream token and proxies the upstream playlist or media, forwarding Range headers. Supports HLS (m3u8) and direct files.',
    parameters: [
      {
        name: 't',
        in: 'query',
        required: true,
        schema: { type: 'string' },
        description: 'Sealed stream token',
      },
      {
        name: 'Range',
        in: 'header',
        required: false,
        schema: { type: 'string' },
        description: 'HTTP Range header, forwarded to the upstream media server',
      },
    ],
    responses: {
      '200': { description: 'Playlist or proxied stream data' },
      '206': { description: 'Partial content for ranged requests' },
      '400': { description: 'Missing or invalid stream token/URL' },
      '403': { description: 'Invalid or expired stream token' },
    },
  },
})

const UPSTREAM_TIMEOUT_MS = 6_000
const PLAYLIST_CACHE_TTL_MS = 10_000
const MAX_PLAYLIST_ENTRIES = 500

type PlaylistEntry = { body: string, contentType: string, expiresAt: number }
const playlistCache = new Map<string, PlaylistEntry>()

function prunePlaylistCache(now: number): void {
  for (const [key, entry] of playlistCache) {
    if (entry.expiresAt <= now) playlistCache.delete(key)
  }
  while (playlistCache.size > MAX_PLAYLIST_ENTRIES) {
    const oldest = playlistCache.keys().next()
    if (oldest.done) break
    playlistCache.delete(oldest.value)
  }
}

function readPlaylistCache(key: string): PlaylistEntry | null {
  const hit = playlistCache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit
  if (hit) playlistCache.delete(key)
  return null
}

function writePlaylistCache(key: string, body: string, contentType: string): void {
  const now = Date.now()
  playlistCache.set(key, { body, contentType, expiresAt: now + PLAYLIST_CACHE_TTL_MS })
  prunePlaylistCache(now)
}

function isPlaylistUrl(url: URL): boolean {
  return url.pathname.toLowerCase().endsWith('.m3u8')
}

function isPlaylistResponse(contentType: string | null): boolean {
  return !!contentType && contentType.toLowerCase().includes('mpegurl')
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = String(query.t || '')

  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing stream token' })

  const rawUrl = await openStreamToken(token)
  if (!rawUrl) throw createError({ statusCode: 403, statusMessage: 'Invalid or expired stream token' })

  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid stream URL' })
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid stream protocol' })
  }

  const cachedPlaylist = isPlaylistUrl(target) ? readPlaylistCache(rawUrl) : null
  if (cachedPlaylist) {
    setHeader(event, 'Content-Type', cachedPlaylist.contentType)
    setHeader(event, 'Cache-Control', 'public, max-age=5, stale-while-revalidate=30')
    return cachedPlaylist.body
  }

  const range = getRequestHeader(event, 'range') || undefined
  const res = await fetch(target, {
    headers: { ...getSpoofHeaders(`${target.origin}/`, 'iframe'), ...(range ? { Range: range } : {}) },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })

  if (!res.ok && res.status !== 206) {
    throw createError({ statusCode: res.status, statusMessage: 'Failed to fetch stream' })
  }

  const contentType = res.headers.get('content-type')

  if (isPlaylistUrl(target) || isPlaylistResponse(contentType)) {
    const body = await res.text()
    const origin = getRequestURL(event).origin
    const rewritten = await rewriteHlsPlaylist(body, target.toString(), origin)
    const playlistType = contentType || 'application/vnd.apple.mpegurl'
    writePlaylistCache(rawUrl, rewritten, playlistType)
    setHeader(event, 'Content-Type', playlistType)
    setHeader(event, 'Cache-Control', 'public, max-age=5, stale-while-revalidate=30')
    return rewritten
  }

  setResponseStatus(event, res.status)
  setHeader(event, 'Content-Type', contentType || 'application/octet-stream')
  if (res.status === 206) {
    setHeader(event, 'Cache-Control', 'no-store')
  } else {
    setHeader(event, 'Cache-Control', 'private, max-age=3600')
  }
  const acceptRanges = res.headers.get('accept-ranges')
  setHeader(event, 'Accept-Ranges', acceptRanges === 'none' ? 'none' : 'bytes')
  const contentLength = Number(res.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > 0) setHeader(event, 'Content-Length', contentLength)
  const contentRange = res.headers.get('content-range')
  if (contentRange) setHeader(event, 'Content-Range', contentRange)
  if (res.body) return res.body
  throw createError({ statusCode: 502, statusMessage: 'Empty upstream response' })
})

async function rewriteHlsPlaylist(text: string, baseUrl: string, origin: string): Promise<string> {
  const lines = text.split('\n').map(async (line) => {
    const trimmed = line.trim()
    if (!trimmed) return line
    if (trimmed.startsWith('#')) {
      const uris = [...line.matchAll(/URI="([^"]+)"/g)].map((match) => match[1] ?? '')
      if (uris.length === 0) return line
      const sealed = await Promise.all(uris.map((uri) => sealedStreamUrl(origin, uri, baseUrl)))
      let index = 0
      return line.replace(/URI="([^"]+)"/g, () => `URI="${sealed[index++] ?? ''}"`)
    }
    return sealedStreamUrl(origin, trimmed, baseUrl)
  })
  return (await Promise.all(lines)).join('\n')
}

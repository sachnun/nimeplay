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

const UPSTREAM_TIMEOUT_MS = 10_000

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
    setHeader(event, 'Content-Type', contentType || 'application/vnd.apple.mpegurl')
    setHeader(event, 'Cache-Control', 'no-store')
    return rewritten
  }

  setResponseStatus(event, res.status)
  setHeader(event, 'Content-Type', contentType || 'application/octet-stream')
  setHeader(event, 'Cache-Control', 'no-store')
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

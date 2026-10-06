import { createError, defineEventHandler, getQuery, getRequestHeader, setResponseStatus } from 'nuxt/server'

const UPSTREAM_TIMEOUT_MS = 10_000

const STRIPPED_ON_RETRY = ['User-Agent', 'Referer', 'Origin', 'Accept', 'Accept-Language']

function fetchUpstream(target: URL, headers: Record<string, string>): Promise<Response | null> {
  return fetch(target, { headers, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }).catch(() => null)
}

const MEDIA_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
}

function mediaContentType(upstreamType: string | null, target: URL): string | null {
  if (upstreamType && !/octet-stream/i.test(upstreamType)) return upstreamType
  const ext = target.pathname.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  return (ext && MEDIA_TYPES[ext]) || upstreamType
}

function isPlaylistUrl(url: URL): boolean {
  return url.pathname.toLowerCase().endsWith('.m3u8')
}

function isPlaylistResponse(contentType: string | null): boolean {
  return !!contentType && contentType.toLowerCase().includes('mpegurl')
}

export default defineEventHandler(async event => {
  const query = getQuery(event)
  const token = String(query.t || '')

  if (!token) throw createError({ status: 400, statusText: 'Missing stream token' })

  const request = await openStreamRequest(token)
  if (!request) throw createError({ status: 403, statusText: 'Invalid or expired stream token' })

  let target: URL
  try {
    target = new URL(request.url)
  } catch {
    throw createError({ status: 400, statusText: 'Invalid stream URL' })
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    throw createError({ status: 400, statusText: 'Invalid stream protocol' })
  }

  const range = getRequestHeader(event, 'range') || undefined

  if (request.megaKey) {
    const mega = await streamMega(target.toString(), request.megaKey, range).catch(() => null)
    if (!mega) throw createError({ status: 502, statusText: 'Failed to fetch stream' })
    setResponseStatus(event, mega.status)
    event.res.headers.set('Content-Type', mega.contentType)
    event.res.headers.set('Accept-Ranges', 'bytes')
    if (mega.status === 206) event.res.headers.set('Content-Range', `bytes ${mega.start}-${mega.end}/${mega.total}`)
    event.res.headers.set('Content-Length', String(mega.end - mega.start + 1))
    event.res.headers.set('Cache-Control', 'no-store')
    return mega.body
  }

  const headers: Record<string, string> = { ...upstreamHeadersFor(target.toString(), range), ...request.headers }
  for (const [key, value] of Object.entries(headers)) {
    if (value === '') delete headers[key]
  }
  let res = await fetchUpstream(target, headers)
  if (res && !res.ok && res.status !== 206) {
    await res.body?.cancel().catch(() => {})
    const minimal = { ...headers }
    for (const key of STRIPPED_ON_RETRY) delete minimal[key]
    res = await fetchUpstream(target, minimal)
  }

  if (!res) throw createError({ status: 502, statusText: 'Failed to fetch stream' })

  if (!res.ok && res.status !== 206) {
    throw createError({ status: res.status, statusText: 'Failed to fetch stream' })
  }

  const contentType = mediaContentType(res.headers.get('content-type'), target)

  if (isPlaylistUrl(target) || isPlaylistResponse(contentType)) {
    const body = await res.text()
    const rewritten = await rewriteHlsPlaylist(body, target.toString()).catch(() => body)
    event.res.headers.set('Content-Type', contentType || 'application/vnd.apple.mpegurl')
    event.res.headers.set('Cache-Control', 'no-store')
    return rewritten
  }

  setResponseStatus(event, res.status)
  event.res.headers.set('Content-Type', contentType || 'application/octet-stream')
  event.res.headers.set('Cache-Control', 'no-store')
  const acceptRanges = res.headers.get('accept-ranges')
  event.res.headers.set('Accept-Ranges', acceptRanges === 'none' ? 'none' : 'bytes')
  const contentLength = Number(res.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > 0)
    event.res.headers.set('Content-Length', String(contentLength))
  const contentRange = res.headers.get('content-range')
  if (contentRange) event.res.headers.set('Content-Range', contentRange)
  if (res.body) return res.body
  throw createError({ status: 502, statusText: 'Empty upstream response' })
})

async function rewriteHlsPlaylist(text: string, baseUrl: string): Promise<string> {
  const lines = text.split('\n').map(async line => {
    const trimmed = line.trim()
    if (!trimmed) return line
    if (trimmed.startsWith('#')) {
      const uris = [...line.matchAll(/URI="([^"]+)"/g)].map(match => match[1] ?? '')
      if (uris.length === 0) return line
      const sealed = await Promise.all(uris.map(uri => sealedStreamUrl(uri, baseUrl)))
      let index = 0
      return line.replace(/URI="([^"]+)"/g, () => `URI="${sealed[index++] ?? ''}"`)
    }
    return sealedStreamUrl(trimmed, baseUrl)
  })
  return (await Promise.all(lines)).join('\n')
}

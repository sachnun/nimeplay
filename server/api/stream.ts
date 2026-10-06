import {
  createError,
  defineEventHandler,
  getQuery,
  getRequestHeader,
  type RequestEvent,
  setResponseStatus,
} from 'nuxt/server'

const UPSTREAM_TIMEOUT_MS = 10_000

const STRIPPED_ON_RETRY = ['User-Agent', 'Referer', 'Origin', 'Accept', 'Accept-Language']

const MEDIA_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
}

function fetchUpstream(target: URL, headers: Record<string, string>): Promise<Response | null> {
  return fetch(target, { headers, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }).catch(() => null)
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

function parseTarget(raw: string): URL {
  let target: URL
  try {
    target = new URL(raw)
  } catch {
    throw createError({ status: 400, statusText: 'Invalid stream URL' })
  }
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw createError({ status: 400, statusText: 'Invalid stream protocol' })
  }
  return target
}

function buildHeaders(target: URL, range: string | undefined, extra: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...upstreamHeadersFor(target.toString(), range), ...extra }
  for (const [key, value] of Object.entries(headers)) {
    if (value === '') delete headers[key]
  }
  return headers
}

async function fetchWithRetry(target: URL, headers: Record<string, string>): Promise<Response | null> {
  const res = await fetchUpstream(target, headers)
  if (!res || res.ok || res.status === 206) return res
  await res.body?.cancel().catch(() => {})
  const minimal = { ...headers }
  for (const key of STRIPPED_ON_RETRY) delete minimal[key]
  return fetchUpstream(target, minimal)
}

async function respondMega(event: RequestEvent, megaKey: string, target: URL, range: string | undefined) {
  const mega = await streamMega(target.toString(), megaKey, range).catch(() => null)
  if (!mega) throw createError({ status: 502, statusText: 'Failed to fetch stream' })
  setResponseStatus(event, mega.status)
  event.res.headers.set('Content-Type', mega.contentType)
  event.res.headers.set('Accept-Ranges', 'bytes')
  if (mega.status === 206) event.res.headers.set('Content-Range', `bytes ${mega.start}-${mega.end}/${mega.total}`)
  event.res.headers.set('Content-Length', String(mega.end - mega.start + 1))
  return mega.body
}

function redirectToTarget(event: RequestEvent, target: URL): void {
  event.res.headers.set('Referrer-Policy', 'no-referrer')
  event.res.headers.set('Location', target.toString())
  setResponseStatus(event, 302)
}

async function sendPlaylist(event: RequestEvent, res: Response, target: URL, contentType: string | null) {
  const body = await res.text()
  const rewritten = await rewriteHlsPlaylist(body, target.toString()).catch(() => body)
  event.res.headers.set('Content-Type', contentType || 'application/vnd.apple.mpegurl')
  return rewritten
}

function sendFile(event: RequestEvent, res: Response, contentType: string | null) {
  setResponseStatus(event, res.status)
  event.res.headers.set('Content-Type', contentType || 'application/octet-stream')
  const acceptRanges = res.headers.get('accept-ranges')
  event.res.headers.set('Accept-Ranges', acceptRanges === 'none' ? 'none' : 'bytes')
  const contentLength = Number(res.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > 0)
    event.res.headers.set('Content-Length', String(contentLength))
  const contentRange = res.headers.get('content-range')
  if (contentRange) event.res.headers.set('Content-Range', contentRange)
  if (!res.body) throw createError({ status: 502, statusText: 'Empty upstream response' })
  return res.body
}

export default defineEventHandler(async event => {
  const token = String(getQuery(event).t || '')
  if (!token) throw createError({ status: 400, statusText: 'Missing stream token' })

  const request = await openStreamRequest(token)
  if (!request) throw createError({ status: 403, statusText: 'Invalid or expired stream token' })

  const target = parseTarget(request.url)
  const range = getRequestHeader(event, 'range') || undefined

  if (request.megaKey) return respondMega(event, request.megaKey, target, range)

  const res = await fetchWithRetry(target, buildHeaders(target, range, request.headers))
  if (!res || (!res.ok && res.status !== 206)) {
    await res?.body?.cancel().catch(() => {})
    redirectToTarget(event, target)
    return
  }

  const contentType = mediaContentType(res.headers.get('content-type'), target)
  if (isPlaylistUrl(target) || isPlaylistResponse(contentType)) return sendPlaylist(event, res, target, contentType)
  return sendFile(event, res, contentType)
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

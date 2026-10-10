import { error } from '@sveltejs/kit'
import { openStreamRequest, rewriteHlsPlaylist, sealedStreamUrl } from '#lib/server/utils/media/stream'
import { streamMega } from '#lib/server/utils/media/mega'
import { upstreamHeadersFor } from '#lib/server/utils/extractors/hosts'
import type { RequestHandler } from './$types'

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
    error(400, 'Invalid stream URL')
  }
  if (!['http:', 'https:'].includes(target.protocol)) error(400, 'Invalid stream protocol')
  return target
}

function buildHeaders(target: URL, range: string | undefined, extra: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...upstreamHeadersFor(target.toString(), range), ...extra }
  for (const [key, value] of Object.entries(headers)) if (value === '') delete headers[key]
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

async function respondMega(megaKey: string, target: URL, range: string | undefined): Promise<Response> {
  const mega = await streamMega(target.toString(), megaKey, range).catch(() => null)
  if (!mega) error(502, 'Failed to fetch stream')
  const headers: Record<string, string> = {
    'Content-Type': mega.contentType,
    'Accept-Ranges': 'bytes',
    'Content-Length': String(mega.end - mega.start + 1),
  }
  if (mega.status === 206) headers['Content-Range'] = `bytes ${mega.start}-${mega.end}/${mega.total}`
  return new Response(mega.body, { status: mega.status, headers })
}

function sendFile(res: Response, contentType: string | null): Response {
  const headers: Record<string, string> = {
    'Content-Type': contentType || 'application/octet-stream',
    'Accept-Ranges': res.headers.get('accept-ranges') === 'none' ? 'none' : 'bytes',
  }
  const contentLength = Number(res.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > 0) headers['Content-Length'] = String(contentLength)
  const contentRange = res.headers.get('content-range')
  if (contentRange) headers['Content-Range'] = contentRange
  if (!res.body) error(502, 'Empty upstream response')
  return new Response(res.body, { status: res.status, headers })
}

async function sendPlaylist(res: Response, target: URL, contentType: string | null): Promise<Response> {
  const body = await res.text()
  const rewritten = await rewriteHlsPlaylist(body, target.toString(), sealedStreamUrl).catch(() => body)
  return new Response(rewritten, {
    headers: { 'Content-Type': contentType || 'application/vnd.apple.mpegurl' },
  })
}

export const GET: RequestHandler = async ({ url, request }) => {
  const token = url.searchParams.get('t') || ''
  if (!token) error(400, 'Missing stream token')

  const streamRequest = await openStreamRequest(token)
  if (!streamRequest) error(403, 'Invalid or expired stream token')

  const target = parseTarget(streamRequest.url)
  const range = request.headers.get('range') || undefined

  if (streamRequest.megaKey) return respondMega(streamRequest.megaKey, target, range)

  const res = await fetchWithRetry(target, buildHeaders(target, range, streamRequest.headers))
  if (!res || (!res.ok && res.status !== 206)) {
    await res?.body?.cancel().catch(() => {})
    return new Response(null, {
      status: 302,
      headers: { Location: target.toString(), 'Referrer-Policy': 'no-referrer' },
    })
  }

  const contentType = mediaContentType(res.headers.get('content-type'), target)
  if (isPlaylistUrl(target) || isPlaylistResponse(contentType)) return sendPlaylist(res, target, contentType)
  return sendFile(res, contentType)
}

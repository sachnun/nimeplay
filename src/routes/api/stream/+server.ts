import { error } from '@sveltejs/kit'
import { Effect } from 'effect'
import { openStreamRequest, rewriteHlsPlaylist, sealedStreamUrl } from '#lib/server/utils/media/stream'
import { streamMega } from '#lib/server/utils/media/mega'
import { flushStreamTelemetry, observeStream } from '#lib/server/utils/media/scores'
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

interface Attribution {
  server?: string
  quality?: string
}

function report(attribution: Attribution, sample: { ok: boolean; ttfbMs?: number; bytes?: number; durationMs?: number }) {
  if (!attribution.server || !attribution.quality) return
  Effect.runFork(observeStream({ server: attribution.server, quality: attribution.quality, ...sample }))
}

function measured(
  body: ReadableStream<Uint8Array>,
  onDone: (result: { bytes: number; durationMs: number; complete: boolean }) => void,
): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  let bytes = 0
  const started = Date.now()
  let settled = false
  const settle = (complete: boolean) => {
    if (settled) return
    settled = true
    onDone({ bytes, durationMs: Date.now() - started, complete })
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) {
        settle(true)
        controller.close()
        return
      }
      bytes += value.byteLength
      controller.enqueue(value)
    },
    cancel(reason) {
      settle(false)
      return reader.cancel(reason)
    },
  })
}

async function respondMega(megaKey: string, target: URL, range: string | undefined, attribution: Attribution): Promise<Response> {
  const started = Date.now()
  const mega = await streamMega(target.toString(), megaKey, range).catch(() => null)
  if (!mega) {
    report(attribution, { ok: false })
    error(502, 'Failed to stream')
  }
  report(attribution, { ok: true, ttfbMs: Date.now() - started })
  const headers: Record<string, string> = {
    'Content-Type': mega.contentType,
    'Accept-Ranges': 'bytes',
    'Content-Length': String(mega.end - mega.start + 1),
  }
  if (mega.status === 206) headers['Content-Range'] = `bytes ${mega.start}-${mega.end}/${mega.total}`
  return new Response(mega.body, { status: mega.status, headers })
}

function sendFile(
  res: Response,
  contentType: string | null,
  attribution: Attribution,
  ttfbMs: number,
): Response {
  const headers: Record<string, string> = {
    'Content-Type': contentType || 'application/octet-stream',
    'Accept-Ranges': res.headers.get('accept-ranges') === 'none' ? 'none' : 'bytes',
  }
  const contentLength = Number(res.headers.get('content-length'))
  const hasLength = Number.isFinite(contentLength) && contentLength > 0
  if (hasLength) headers['Content-Length'] = String(contentLength)
  const contentRange = res.headers.get('content-range')
  if (contentRange) headers['Content-Range'] = contentRange
  if (!res.body) error(502, 'Empty upstream response')
  const body = measured(res.body, ({ bytes, durationMs, complete }) => {
    const intact = complete && (!hasLength || bytes >= contentLength)
    report(attribution, { ok: intact, ttfbMs, bytes, durationMs })
  })
  return new Response(body, { status: res.status, headers })
}

async function sendPlaylist(res: Response, target: URL, contentType: string | null, attribution: Attribution): Promise<Response> {
  const body = await res.text()
  const rewritten = await rewriteHlsPlaylist(body, target.toString(), (uri, base) =>
    sealedStreamUrl(uri, base, attribution.server && attribution.quality ? { server: attribution.server, quality: attribution.quality } : undefined),
  ).catch(() => body)
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
  const attribution: Attribution = { server: streamRequest.server, quality: streamRequest.quality }

  // flush the in-isolate buffer while the request is still alive
  Effect.runFork(flushStreamTelemetry())

  if (streamRequest.megaKey) return respondMega(streamRequest.megaKey, target, range, attribution)

  const startedAt = Date.now()
  const res = await fetchWithRetry(target, buildHeaders(target, range, streamRequest.headers))
  const ttfbMs = Date.now() - startedAt
  if (!res || (!res.ok && res.status !== 206)) {
    await res?.body?.cancel().catch(() => {})
    report(attribution, { ok: false, ttfbMs })
    return new Response(null, {
      status: 302,
      headers: { Location: target.toString(), 'Referrer-Policy': 'no-referrer' },
    })
  }

  const contentType = mediaContentType(res.headers.get('content-type'), target)
  if (isPlaylistUrl(target) || isPlaylistResponse(contentType)) return sendPlaylist(res, target, contentType, attribution)
  return sendFile(res, contentType, attribution, ttfbMs)
}

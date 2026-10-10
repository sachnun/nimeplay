import { Effect } from 'effect'
import { proxyUrl } from '../media/proxy'
import { runGuarded } from './rate'

interface PlainResponse {
  status: number
  text: string
  headers: Record<string, string>
}

interface PlainOptions {
  headers?: Record<string, string>
  timeoutMs?: number
  proxy?: boolean
}

interface PlainBinaryResponse {
  status: number
  contentType: string
  bytes: Uint8Array
}

const DEFAULT_UA = 'okhttp/4.9.0'
const DEFAULT_TIMEOUT_MS = 8000

function toHeaderRecord(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined) out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value
  }
  return out
}

function buildHeaders(options: PlainOptions): Record<string, string> {
  return {
    'user-agent': DEFAULT_UA,
    accept: 'application/json, */*',
    ...options.headers,
  }
}

async function readText(target: string, headers: Record<string, string>, signal: AbortSignal): Promise<PlainResponse> {
  const res = await fetch(target, { headers, signal })
  return { status: res.status, text: await res.text(), headers: toHeaderRecord(Object.fromEntries(res.headers)) }
}

async function readBinary(
  target: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<PlainBinaryResponse> {
  const res = await fetch(target, { headers, signal })
  return {
    status: res.status,
    contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    bytes: new Uint8Array(await res.arrayBuffer()),
  }
}

export async function plainGet(url: string, options: PlainOptions = {}): Promise<PlainResponse | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const target = proxyUrl(url, options.proxy)
  const effect = runGuarded({
    url,
    task: signal => readText(target, buildHeaders(options), signal),
    timeoutMs,
    status: value => value.status,
  }).pipe(Effect.catchTag('NetError', () => Effect.succeed(null)))
  return Effect.runPromise(effect)
}

export async function plainGetBinary(url: string, options: PlainOptions = {}): Promise<PlainBinaryResponse | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const target = proxyUrl(url, options.proxy)
  const headers = { 'user-agent': DEFAULT_UA, accept: 'image/avif,image/webp,image/*,*/*', ...options.headers }
  const effect = runGuarded({
    url,
    task: signal => readBinary(target, headers, signal),
    timeoutMs,
    status: value => value.status,
  }).pipe(Effect.catchTag('NetError', () => Effect.succeed(null)))
  return Effect.runPromise(effect)
}

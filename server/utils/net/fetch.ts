import { proxyUrl } from '../media/proxy'
import { isRetryableStatus, withRetry } from './retry'

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

async function fetchGet(
  target: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<PlainResponse | null> {
  try {
    const res = await fetch(target, { headers, signal: AbortSignal.timeout(timeoutMs) })
    return { status: res.status, text: await res.text(), headers: toHeaderRecord(Object.fromEntries(res.headers)) }
  } catch {
    return null
  }
}

async function fetchGetBinary(
  target: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<PlainBinaryResponse | null> {
  try {
    const res = await fetch(target, { headers, signal: AbortSignal.timeout(timeoutMs) })
    return {
      status: res.status,
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      bytes: new Uint8Array(await res.arrayBuffer()),
    }
  } catch {
    return null
  }
}

export async function plainGet(url: string, options: PlainOptions = {}): Promise<PlainResponse | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const headers = {
    'user-agent': DEFAULT_UA,
    accept: 'application/json, */*',
    ...options.headers,
  }
  const target = proxyUrl(url, options.proxy)
  return withRetry(async () => {
    const res = await fetchGet(target, headers, timeoutMs)
    if (!res) return { value: null, retry: true }
    return { value: res, retry: isRetryableStatus(res.status), headers: res.headers }
  })
}

export async function plainGetBinary(url: string, options: PlainOptions = {}): Promise<PlainBinaryResponse | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const headers = {
    'user-agent': DEFAULT_UA,
    accept: 'image/avif,image/webp,image/*,*/*',
    ...options.headers,
  }
  const target = proxyUrl(url, options.proxy)
  return withRetry(async () => {
    const res = await fetchGetBinary(target, headers, timeoutMs)
    if (!res) return { value: null, retry: true }
    return { value: res, retry: isRetryableStatus(res.status) }
  })
}

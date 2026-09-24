export const RETRY_ATTEMPTS = 5
export const RETRY_BASE_MS = 500
export const RETRY_MAX_MS = 10_000

export type HeaderBag = Headers | Record<string, string>

export interface Outcome<T> {
  value: T | null
  retry: boolean
  headers?: HeaderBag | null
}

function headerValue(headers: HeaderBag, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  return headers[name.toLowerCase()]
}

function parseRetryAfter(headers: HeaderBag): number | null {
  const value = headerValue(headers, 'retry-after')
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const at = Date.parse(value)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null
}

export function isRetryableStatus(status: number): boolean {
  return status === 403 || status === 408 || status === 425 || status === 429 || status >= 500
}

export function retryDelayMs(headers: HeaderBag | null | undefined, attempt: number): number {
  const retryAfter = headers ? parseRetryAfter(headers) : null
  if (retryAfter !== null) return Math.min(retryAfter, RETRY_MAX_MS)
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt) + Math.floor(Math.random() * 250)
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function withRetry<T>(run: () => Promise<Outcome<T>>): Promise<T | null> {
  let last: T | null = null
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    const outcome = await run()
    if (outcome.value !== null) last = outcome.value
    if (!outcome.retry) return outcome.value
    if (attempt < RETRY_ATTEMPTS - 1) await sleep(retryDelayMs(outcome.headers, attempt))
  }
  return last
}

import { Context, Effect, Layer } from 'effect'
import { proxyFetch, proxyUrl } from '../media/proxy'
import { NetError, runGuarded } from './rate'
import { getSpoofHeaders } from './spoof'

export interface PlainResponse {
  status: number
  text: string
  headers: Record<string, string>
}

export interface PlainBinaryResponse {
  status: number
  contentType: string
  bytes: Uint8Array
}

export interface PlainOptions {
  headers?: Record<string, string>
  timeoutMs?: number
  proxy?: boolean
}

const DEFAULT_UA = 'okhttp/4.9.0'
const DEFAULT_TIMEOUT_MS = 8000
const NAVIGATE_TIMEOUT_MS = 8000

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'invalid'
  }
}

function responseHeaders(response: Response): Record<string, string> {
  const out: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    out[key.toLowerCase()] = value
  })
  return out
}

function readText(target: string, headers: Record<string, string>, signal: AbortSignal): Promise<PlainResponse> {
  return fetch(target, { headers, signal }).then(async response => ({
    status: response.status,
    text: await response.text(),
    headers: responseHeaders(response),
  }))
}

function readBinary(
  target: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<PlainBinaryResponse> {
  return fetch(target, { headers, signal }).then(async response => ({
    status: response.status,
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    bytes: new Uint8Array(await response.arrayBuffer()),
  }))
}

function readBody(response: Response): Effect.Effect<string, NetError> {
  return Effect.tryPromise({
    try: () => response.text(),
    catch: error =>
      new NetError({
        host: hostOf(response.url),
        status: response.status,
        message: error instanceof Error ? error.message : String(error),
        retryAfterMs: 0,
      }),
  })
}

function decodeJson(response: Response, url: string): Effect.Effect<Record<string, unknown>, NetError> {
  return Effect.tryPromise({
    try: async () => (await response.json()) as Record<string, unknown>,
    catch: error =>
      new NetError({
        host: hostOf(url),
        status: response.status,
        message: error instanceof Error ? error.message : String(error),
        retryAfterMs: 0,
      }),
  })
}

export interface HttpShape {
  readonly html: (url: string, timeoutMs?: number) => Effect.Effect<string, NetError>
  readonly form: (url: string, body: string, referer: string) => Effect.Effect<Record<string, unknown>, NetError>
  readonly formText: (url: string, body: string, referer: string) => Effect.Effect<string, NetError>
  readonly text: (url: string, options?: PlainOptions) => Effect.Effect<PlainResponse | null>
  readonly binary: (url: string, options?: PlainOptions) => Effect.Effect<PlainBinaryResponse | null>
}

export class Http extends Context.Service<Http, HttpShape>()('app/Http') {}

export const HttpLive = Layer.succeed(
  Http,
  Http.of({
    html: (url, timeoutMs = NAVIGATE_TIMEOUT_MS) =>
      Effect.gen(function* () {
        const response = yield* runGuarded({
          url,
          task: signal => proxyFetch(url, { headers: getSpoofHeaders(url, 'navigate'), signal }),
          timeoutMs,
          status: value => value.status,
        })
        if (!response.ok) {
          return yield* Effect.fail(
            new NetError({
              host: hostOf(url),
              status: response.status,
              message: `HTTP ${response.status}`,
              retryAfterMs: 0,
            }),
          )
        }
        return yield* readBody(response)
      }),

    form: (url, body, referer) =>
      Effect.gen(function* () {
        const headers = getSpoofHeaders(referer, 'cors')
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        const response = yield* runGuarded({
          url,
          task: signal => proxyFetch(url, { method: 'POST', headers, body, signal }),
          timeoutMs: DEFAULT_TIMEOUT_MS,
          status: value => value.status,
        })
        if (!response.ok) {
          return yield* Effect.fail(
            new NetError({
              host: hostOf(url),
              status: response.status,
              message: `HTTP ${response.status}`,
              retryAfterMs: 0,
            }),
          )
        }
        return yield* decodeJson(response, url)
      }),

    formText: (url, body, referer) =>
      Effect.gen(function* () {
        const headers = getSpoofHeaders(referer, 'cors')
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        const response = yield* runGuarded({
          url,
          task: signal => proxyFetch(url, { method: 'POST', headers, body, signal }),
          timeoutMs: DEFAULT_TIMEOUT_MS,
          status: value => value.status,
        })
        if (!response.ok) {
          return yield* Effect.fail(
            new NetError({
              host: hostOf(url),
              status: response.status,
              message: `HTTP ${response.status}`,
              retryAfterMs: 0,
            }),
          )
        }
        return yield* readBody(response)
      }),

    text: (url, options = {}) => {
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
      const target = proxyUrl(url, options.proxy)
      const headers = { 'user-agent': DEFAULT_UA, accept: 'application/json, */*', ...options.headers }
      return runGuarded({
        url,
        task: signal => readText(target, headers, signal),
        timeoutMs,
        status: value => value.status,
      }).pipe(Effect.catchTag('NetError', () => Effect.succeed(null)))
    },

    binary: (url, options = {}) => {
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
      const target = proxyUrl(url, options.proxy)
      const headers = {
        'user-agent': DEFAULT_UA,
        accept: 'image/avif,image/webp,image/*,*/*',
        ...options.headers,
      }
      return runGuarded({
        url,
        task: signal => readBinary(target, headers, signal),
        timeoutMs,
        status: value => value.status,
      }).pipe(Effect.catchTag('NetError', () => Effect.succeed(null)))
    },
  }),
)

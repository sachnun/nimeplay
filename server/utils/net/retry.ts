import { Data, Duration, Effect, Schedule } from 'effect'

const RETRY_ATTEMPTS = 5
const RETRY_BASE_MS = 500
const RETRY_MAX_MS = 10_000
const RETRY_JITTER_MS = 250

type HeaderBag = Headers | Record<string, string>

interface Outcome<T> {
  value: T | null
  retry: boolean
  headers?: HeaderBag | null
}

class RetryNeeded extends Data.TaggedError('RetryNeeded')<{ readonly headers: HeaderBag | null }> {}

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

const retryPolicy = Schedule.exponential(Duration.millis(RETRY_BASE_MS), 2).pipe(
  Schedule.setInputType<RetryNeeded>(),
  Schedule.modifyDelay(({ duration, input }) => {
    const retryAfter = input.headers ? parseRetryAfter(input.headers) : null
    const backoff = Duration.toMillis(duration) + Math.floor(Math.random() * RETRY_JITTER_MS)
    return Effect.succeed(Duration.millis(Math.min(retryAfter ?? backoff, RETRY_MAX_MS)))
  }),
  Schedule.upTo({ times: RETRY_ATTEMPTS - 1 }),
)

export async function withRetry<T>(run: () => Promise<Outcome<T>>): Promise<T | null> {
  let last: T | null = null
  const attempt = Effect.gen(function* () {
    const outcome = yield* Effect.promise(() => run())
    if (outcome.value !== null) last = outcome.value
    if (outcome.retry) return yield* Effect.fail(new RetryNeeded({ headers: outcome.headers ?? null }))
    return outcome.value
  })
  return Effect.runPromise(
    attempt.pipe(
      Effect.retry(retryPolicy),
      Effect.catchTag('RetryNeeded', () => Effect.succeed(last)),
    ),
  )
}

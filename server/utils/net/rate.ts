import { Clock, Duration, Effect, HashMap, Metric, Option, PartitionedSemaphore, Ref, Schedule, Schema } from 'effect'

export function isRetryableStatus(status: number): boolean {
  return status === 403 || status === 408 || status === 425 || status === 429 || status >= 500
}

const PER_HOST = Math.max(1, Number(process.env.FETCH_PER_HOST ?? 3))
const BREAKER_THRESHOLD = Math.max(1, Number(process.env.FETCH_BREAKER_THRESHOLD ?? 6))
const BREAKER_OPEN_MS = 3 * 60 * 1000
const RETRY_ATTEMPTS = Math.max(1, Number(process.env.FETCH_RETRY_ATTEMPTS ?? 3))
const RETRY_BASE_MS = 400
const RETRY_CAP_MS = 8000

const HOST_INTERVAL_MS: Record<string, number> = {
  'anilist.co': 700,
  'graphql.anilist.co': 700,
}

export class NetError extends Schema.TaggedError<NetError>()('NetError', {
  host: Schema.String,
  status: Schema.NullOr(Schema.Number),
  message: Schema.String,
  retryAfterMs: Schema.Number,
}) {
  get retryable(): boolean {
    return this.status === null || isRetryableStatus(this.status)
  }
}

interface BreakerState {
  failures: number
  openUntil: number
}

const limiter = PartitionedSemaphore.makeUnsafe<string>({ permits: PER_HOST })
const breakers = Ref.makeUnsafe(HashMap.empty<string, BreakerState>())
const lastCallAt = Ref.makeUnsafe(HashMap.empty<string, number>())

const attemptsMetric = Metric.counter('net_attempts_total', { incremental: true })
const failuresMetric = Metric.counter('net_failures_total', { incremental: true })
const tripsMetric = Metric.counter('net_circuit_trips_total', { incremental: true })
const retriesMetric = Metric.counter('net_retries_total', { incremental: true })

const baseRetrySchedule = Schedule.min([
  Schedule.exponential(Duration.millis(RETRY_BASE_MS)),
  Schedule.spaced(Duration.millis(RETRY_CAP_MS)),
]).pipe(
  Schedule.setInputType<NetError>(),
  Schedule.while(({ input }) => input.retryable),
  Schedule.modifyDelay(({ duration, input }) => {
    const backoff = Duration.toMillis(duration) + Math.floor(Math.random() * 250)
    const delay = Math.min(input.retryAfterMs > 0 ? input.retryAfterMs : backoff, RETRY_CAP_MS)
    return Effect.succeed(Duration.millis(delay))
  }),
  Schedule.tap(() => Metric.update(retriesMetric, 1)),
)

function retryPolicy(attempts: number): Schedule.Schedule<Duration.Duration, NetError> {
  return baseRetrySchedule.pipe(
    Schedule.upTo({ times: Math.max(0, attempts - 1) }),
    Schedule.tap(() => Metric.update(retriesMetric, 1)),
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'invalid'
  }
}

function isOpen(host: string): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    const map = yield* Ref.get(breakers)
    const state = HashMap.get(map, host)
    if (Option.isNone(state)) return false
    return state.value.openUntil > (yield* Clock.currentTimeMillis)
  })
}

function recordFailure(host: string): Effect.Effect<void> {
  return Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    const tripped = yield* Ref.modify(breakers, map => {
      const previous = HashMap.get(map, host)
      const failures = (Option.isSome(previous) ? previous.value.failures : 0) + 1
      if (failures >= BREAKER_THRESHOLD) {
        return [true, HashMap.set(map, host, { failures: 0, openUntil: now + BREAKER_OPEN_MS })]
      }
      return [false, HashMap.set(map, host, { failures, openUntil: 0 })]
    })
    if (tripped) yield* Metric.update(tripsMetric, 1)
    yield* Metric.update(failuresMetric, 1)
  })
}

function recordSuccess(host: string): Effect.Effect<void> {
  return Ref.update(breakers, map => HashMap.set(map, host, { failures: 0, openUntil: 0 }))
}

function pace(host: string): Effect.Effect<void> {
  const interval = HOST_INTERVAL_MS[host] ?? 0
  if (interval <= 0) return Effect.void
  return Effect.gen(function* () {
    const map = yield* Ref.get(lastCallAt)
    const previous = HashMap.get(map, host)
    const now = yield* Clock.currentTimeMillis
    const wait = Option.isSome(previous) ? interval - (now - previous.value) : 0
    if (wait > 0) yield* Effect.sleep(Duration.millis(wait))
    const stamp = yield* Clock.currentTimeMillis
    yield* Ref.update(lastCallAt, current => HashMap.set(current, host, stamp))
  })
}

function retryAfterMs(response: Response): number {
  const header = response.headers.get('retry-after')
  if (!header) return 0
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, RETRY_CAP_MS)
  const at = Date.parse(header)
  return Number.isFinite(at) ? Math.min(Math.max(0, at - Date.now()), RETRY_CAP_MS) : 0
}

interface GuardOptions<A> {
  readonly url: string
  readonly task: (signal: AbortSignal) => Promise<A>
  readonly timeoutMs: number
  readonly status: (value: A) => number | null
  readonly retryAfter?: (value: A) => number
  readonly attempts?: number
}

export function runGuarded<A>(options: GuardOptions<A>): Effect.Effect<A, NetError> {
  const { url, task, timeoutMs, status: statusOf } = options
  const host = hostOf(url)
  const schedule = retryPolicy(options.attempts ?? RETRY_ATTEMPTS)

  const attempt = Effect.gen(function* () {
    yield* pace(host)
    yield* Metric.update(attemptsMetric, 1)
    const value = yield* Effect.tryPromise({
      try: signal => task(signal),
      catch: error =>
        error instanceof NetError
          ? error
          : new NetError({
              host,
              status: null,
              message: error instanceof Error ? error.message : String(error),
              retryAfterMs: 0,
            }),
    }).pipe(
      Effect.timeout(Duration.millis(timeoutMs)),
      Effect.catchTag('TimeoutError', () =>
        Effect.fail(new NetError({ host, status: null, message: `timeout after ${timeoutMs}ms`, retryAfterMs: 0 })),
      ),
    )
    const status = statusOf(value)
    if (status !== null && isRetryableStatus(status)) {
      const retryAfter = options.retryAfter?.(value) ?? 0
      return yield* Effect.fail(new NetError({ host, status, message: `HTTP ${status}`, retryAfterMs: retryAfter }))
    }
    return value
  }).pipe(Effect.retry(schedule))

  const guarded = PartitionedSemaphore.withPermit(limiter, host)(attempt).pipe(
    Effect.tap(value => (statusOf(value) === null ? recordSuccess(host) : Effect.void)),
    Effect.tapError(error => (error.retryable ? recordFailure(host) : Effect.void)),
  )

  return Effect.gen(function* () {
    if (yield* isOpen(host)) {
      return yield* Effect.fail(
        new NetError({ host, status: null, message: `circuit open for ${host}`, retryAfterMs: 0 }),
      )
    }
    return yield* guarded
  })
}

export interface NetStats {
  attempts: number
  failures: number
  retries: number
  trips: number
}

export function netStats(): Effect.Effect<NetStats> {
  return Effect.all({
    attempts: Metric.value(attemptsMetric),
    failures: Metric.value(failuresMetric),
    retries: Metric.value(retriesMetric),
    trips: Metric.value(tripsMetric),
  }).pipe(
    Effect.map(values => ({
      attempts: values.attempts.count,
      failures: values.failures.count,
      retries: values.retries.count,
      trips: values.trips.count,
    })),
  )
}

export { retryAfterMs }

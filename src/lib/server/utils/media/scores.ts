import { Duration, Effect, HashMap, Option, Ref } from 'effect'
import { sql } from 'drizzle-orm'
import { db, resultRows } from '../db'
import {
  sampleSpeed,
  statScore,
  unknownScore,
  type SourceScoreInput,
} from '#lib/shared/utils/mirror'

const CACHE_TTL = Duration.seconds(60)
const HALF_LIFE_S = 7 * 24 * 60 * 60
const SPEED_WEIGHT = 0.3
const FLUSH_INTERVAL_MS = 10_000
const FLUSH_MAX_KEYS = 32
const FLUSH_MAX_SAMPLES = 40

export interface StreamSample {
  server: string
  quality: string
  ok: boolean
  ttfbMs?: number
  durationMs?: number
  bytes?: number
}

export interface SourceScores {
  scoreOf(server: string, quality: string): number
  size: number
}

interface StreamDelta {
  server: string
  quality: string
  samples: number
  alpha: number
  beta: number
  speedBps: number
  ttfMs: number
  ok: boolean
}

interface Pending {
  server: string
  quality: string
  samples: number
  alpha: number
  beta: number
  ok: boolean
  ttfMs: number
  speedSum: number
  speedCount: number
}

interface Buffer {
  entries: HashMap.HashMap<string, Pending>
  samples: number
}

interface CacheEntry {
  scores: Map<string, SourceScoreInput>
  byServer: Map<string, SourceScoreInput>
}

interface ScoreCache {
  entry: CacheEntry | null
  loadedAt: number
  generation: number
  refreshing: boolean
}

interface StatRow {
  server: string
  quality: string
  alpha: number
  beta: number
  samples: number | string
  speed_bps: number
  ttf_ms: number
  updated_at: string | Date
}

const EMPTY_SCORES: SourceScores = {
  scoreOf: () => unknownScore(),
  size: 0,
}

const CACHE_TTL_MS = Duration.toMillis(CACHE_TTL)

const buffer = Ref.makeUnsafe<Buffer>({ entries: HashMap.empty<string, Pending>(), samples: 0 })
const cache = Ref.makeUnsafe<ScoreCache>({ entry: null, loadedAt: 0, generation: 0, refreshing: false })

let flushTimer: ReturnType<typeof setTimeout> | null = null

function pairKey(server: string, quality: string): string {
  return `${server.toLowerCase()}\u0000${quality}`
}

function mergeRows(rows: SourceScoreInput[]): CacheEntry {
  const scores = new Map<string, SourceScoreInput>()
  const byServer = new Map<string, SourceScoreInput>()
  for (const row of rows) {
    scores.set(pairKey(row.server, row.quality), row)
    const key = row.server.toLowerCase()
    const current = byServer.get(key)
    if (!current) {
      byServer.set(key, { ...row })
      continue
    }
    const samples = current.samples + row.samples
    const speedBps =
      samples > 0 ? (current.speedBps * current.samples + row.speedBps * row.samples) / samples : current.speedBps
    byServer.set(key, {
      ...current,
      alpha: current.alpha + row.alpha,
      beta: current.beta + row.beta,
      samples,
      speedBps,
      ttfMs: Math.max(current.ttfMs, row.ttfMs),
      updatedAt: Math.max(current.updatedAt, row.updatedAt),
    })
  }
  return { scores, byServer }
}

function toScoreInput(row: StatRow): SourceScoreInput {
  return {
    server: row.server,
    quality: row.quality,
    alpha: Number(row.alpha),
    beta: Number(row.beta),
    samples: Number(row.samples),
    speedBps: Number(row.speed_bps),
    ttfMs: Number(row.ttf_ms),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

function buildScores(entry: CacheEntry): SourceScores {
  const now = Date.now()
  const pairScores = new Map<string, number>()
  for (const [key, stat] of entry.scores) pairScores.set(key, statScore(stat, stat.quality, now))
  const serverScores = new Map<string, number>()
  for (const [key, stat] of entry.byServer) serverScores.set(key, statScore(stat, '720p', now))
  return {
    scoreOf(server: string, quality: string): number {
      const key = server.toLowerCase()
      return pairScores.get(pairKey(key, quality)) ?? serverScores.get(key) ?? unknownScore()
    },
    size: entry.scores.size,
  }
}

const fetchScores: Effect.Effect<CacheEntry | null> = Effect.tryPromise({
  try: async () => {
    const result = await db().execute(sql`
      select server, quality, alpha, beta, samples, speed_bps, ttf_ms, updated_at
      from source_stats
    `)
    return mergeRows(resultRows<StatRow>(result).map(toScoreInput))
  },
  catch: () => null,
}).pipe(Effect.catch(() => Effect.succeed(null)))

function refreshScores(force: boolean): Effect.Effect<void> {
  return Effect.gen(function* () {
    const current = yield* Ref.get(cache)
    if (!force) {
      if (current.refreshing) return
      if (current.entry && Date.now() - current.loadedAt < CACHE_TTL_MS) return
    }
    const generation = current.generation + 1
    yield* Ref.update(cache, value => ({ ...value, generation, refreshing: true }))
    const entry = yield* fetchScores
    yield* Ref.update(cache, value =>
      value.generation > generation
        ? { ...value, refreshing: false }
        : { entry: entry ?? value.entry, loadedAt: Date.now(), generation, refreshing: false },
    )
  })
}

export const loadSourceScores: Effect.Effect<SourceScores> = Effect.sync(() => {
  const current = Ref.getUnsafe(cache)
  const stale = !current.entry || Date.now() - current.loadedAt >= CACHE_TTL_MS
  if (stale && !current.refreshing) Effect.runFork(refreshScores(false))
  return current.entry ? buildScores(current.entry) : EMPTY_SCORES
})

function keyOf(server: string, quality: string): string {
  return `${server.toLowerCase()}\u0000${quality}`
}

function accumulate(current: Option.Option<Pending>, sample: StreamSample): Pending {
  const entry: Pending = Option.isSome(current)
    ? current.value
    : {
        server: sample.server,
        quality: sample.quality,
        samples: 0,
        alpha: 0,
        beta: 0,
        ok: true,
        ttfMs: 0,
        speedSum: 0,
        speedCount: 0,
      }
  entry.samples += 1
  if (sample.ok) entry.alpha += 1
  else {
    entry.beta += 1
    entry.ok = false
  }
  if (sample.ttfbMs && sample.ttfbMs > 0) entry.ttfMs = Math.max(entry.ttfMs, sample.ttfbMs)
  if (sample.bytes && sample.durationMs) {
    const speed = sampleSpeed(sample.bytes, sample.durationMs)
    if (speed > 0) {
      entry.speedSum += speed
      entry.speedCount += 1
    }
  }
  return entry
}

function toDeltas(entries: HashMap.HashMap<string, Pending>): StreamDelta[] {
  const deltas: StreamDelta[] = []
  for (const entry of HashMap.values(entries)) {
    deltas.push({
      server: entry.server,
      quality: entry.quality,
      samples: entry.samples,
      alpha: entry.alpha,
      beta: entry.beta,
      speedBps: entry.speedCount > 0 ? entry.speedSum / entry.speedCount : 0,
      ttfMs: entry.ttfMs,
      ok: entry.ok,
    })
  }
  return deltas
}

function clearFlushTimer(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    if (Ref.getUnsafe(buffer).samples > 0) Effect.runFork(flushStreamTelemetry())
  }, FLUSH_INTERVAL_MS)
}

export function observeStream(sample: StreamSample): Effect.Effect<void> {
  if (!sample.server || !sample.quality) return Effect.void
  const key = keyOf(sample.server, sample.quality)
  return Effect.gen(function* () {
    const next = yield* Ref.getAndUpdate(buffer, state => ({
      entries: HashMap.set(state.entries, key, accumulate(HashMap.get(state.entries, key), sample)),
      samples: state.samples + 1,
    }))
    const samples = next.samples + 1
    if (samples >= FLUSH_MAX_SAMPLES || HashMap.size(next.entries) >= FLUSH_MAX_KEYS) {
      yield* flushStreamTelemetry()
      return
    }
    scheduleFlush()
  })
}

function upsertStatement(rows: StreamDelta[]) {
  const values = sql.join(
    rows.map(
      delta => sql`(
        ${delta.server}, ${delta.quality}, ${delta.alpha}, ${delta.beta}, ${delta.samples},
        ${delta.speedBps}, ${delta.ttfMs}, ${delta.ok}
      )`,
    ),
    sql`, `,
  )
  return sql`
    insert into source_stats (server, quality, alpha, beta, samples, speed_bps, ttf_ms, last_ok_at, last_fail_at, updated_at)
    select v.server, v.quality, v.alpha, v.beta, v.samples, v.speed_bps, v.ttf_ms,
           case when v.ok then now() end, case when v.ok then null else now() end, now()
    from (values ${values}) as v(server, quality, alpha, beta, samples, speed_bps, ttf_ms, ok)
    on conflict (server, quality) do update set
      alpha = decayed(source_stats.alpha, source_stats.updated_at, ${HALF_LIFE_S}) + excluded.alpha,
      beta = decayed(source_stats.beta, source_stats.updated_at, ${HALF_LIFE_S}) + excluded.beta,
      samples = source_stats.samples + excluded.samples,
      speed_bps = case
        when excluded.speed_bps > 0 then
          decayed(source_stats.speed_bps, source_stats.updated_at, ${HALF_LIFE_S}) * ${1 - SPEED_WEIGHT}
          + excluded.speed_bps * ${SPEED_WEIGHT}
        else source_stats.speed_bps end,
      ttf_ms = case
        when excluded.ttf_ms > 0 then
          decayed(source_stats.ttf_ms, source_stats.updated_at, ${HALF_LIFE_S}) * ${1 - SPEED_WEIGHT}
          + excluded.ttf_ms * ${SPEED_WEIGHT}
        else source_stats.ttf_ms end,
      last_ok_at = case when excluded.last_ok_at is not null then excluded.last_ok_at else source_stats.last_ok_at end,
      last_fail_at = case when excluded.last_fail_at is not null then excluded.last_fail_at else source_stats.last_fail_at end,
      updated_at = now()
  `
}

export function flushStreamTelemetry(): Effect.Effect<void> {
  return Effect.gen(function* () {
    const state = yield* Ref.getAndSet(buffer, { entries: HashMap.empty<string, Pending>(), samples: 0 })
    clearFlushTimer()
    const deltas = toDeltas(state.entries)
    if (deltas.length === 0) return
    yield* Effect.tryPromise({
      try: () => db().execute(upsertStatement(deltas)),
      catch: () => null,
    }).pipe(Effect.catch(() => Effect.void))
    yield* refreshScores(true)
  })
}

export function invalidateSourceScores(): Effect.Effect<void> {
  return Ref.update(cache, value => ({
    entry: null,
    loadedAt: 0,
    generation: value.generation + 1,
    refreshing: false,
  }))
}

export function pendingStreamSamples(): number {
  return Ref.getUnsafe(buffer).samples
}

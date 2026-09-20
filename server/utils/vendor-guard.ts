import type { JobRow } from '../database/schema'
import { splitSource } from './sources'

const CONCURRENCY = 4
const BREAKER_THRESHOLD = 5
const BREAKER_OPEN_MS = 10 * 60 * 1000

interface GuardState {
  inflight: number
  failures: number
  openUntil: number
  queue: (() => void)[]
}

const states = new Map<string, GuardState>()

function get(id: string): GuardState {
  let state = states.get(id)
  if (!state) {
    state = { inflight: 0, failures: 0, openUntil: 0, queue: [] }
    states.set(id, state)
  }
  return state
}

export function sourceOf(job: JobRow): string | null {
  const { sourceId, slug } = job.payload
  if (typeof sourceId === 'string') return sourceId
  if (typeof slug === 'string') return splitSource(slug)?.source.id ?? null
  return null
}

export function blockedSources(): string[] {
  const now = Date.now()
  return [...states.entries()]
    .filter(([, state]) => state.openUntil > now || state.inflight >= CONCURRENCY)
    .map(([id]) => id)
}

async function acquire(id: string): Promise<void> {
  const state = get(id)
  if (state.inflight < CONCURRENCY) {
    state.inflight++
    return
  }
  await new Promise<void>(resolve => state.queue.push(resolve))
}

function release(id: string): void {
  const state = get(id)
  const next = state.queue.shift()
  if (next) next()
  else state.inflight--
}

export async function runGuarded<T>(id: string | null, fn: () => Promise<T>): Promise<T> {
  if (!id) return fn()
  await acquire(id)
  try {
    return await fn()
  }
  finally {
    release(id)
  }
}

export function recordSuccess(id: string | null): void {
  if (!id) return
  const state = get(id)
  state.failures = 0
  state.openUntil = 0
}

export function recordFailure(id: string | null): void {
  if (!id) return
  const state = get(id)
  if (state.openUntil > Date.now()) return
  if (++state.failures < BREAKER_THRESHOLD) return
  state.failures = 0
  state.openUntil = Date.now() + BREAKER_OPEN_MS
  console.warn(`[breaker] open ${id} for ${BREAKER_OPEN_MS / 60_000}m`)
}

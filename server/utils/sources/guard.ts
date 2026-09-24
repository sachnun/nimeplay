import type { JobRow } from '../../database/schema'
import { splitSource } from './index'

const BREAKER_THRESHOLD = 8
const BREAKER_OPEN_MS = 10 * 60 * 1000

interface GuardState {
  failures: number
  openUntil: number
}

const states = new Map<string, GuardState>()

function get(id: string): GuardState {
  let state = states.get(id)
  if (!state) {
    state = { failures: 0, openUntil: 0 }
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
    .filter(([, state]) => state.openUntil > now)
    .map(([id]) => id)
}

export function recordSuccess(id: string | null): void {
  if (!id) return
  const state = get(id)
  state.failures = 0
  state.openUntil = 0
}

export function recordFailure(id: string | null): boolean {
  if (!id) return false
  const state = get(id)
  if (state.openUntil > Date.now()) return false
  if (++state.failures < BREAKER_THRESHOLD) return false
  state.failures = 0
  state.openUntil = Date.now() + BREAKER_OPEN_MS
  return true
}

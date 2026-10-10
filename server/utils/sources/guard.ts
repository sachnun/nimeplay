import { Clock, Effect, HashMap, Option, Ref } from 'effect'
import type { JobRow } from '../../database/schema'
import { splitSource } from './index'

const BREAKER_THRESHOLD = 8
const BREAKER_OPEN_MS = 10 * 60 * 1000

interface GuardState {
  failures: number
  openUntil: number
}

const states = Ref.makeUnsafe(HashMap.empty<string, GuardState>())

export function sourceOf(job: JobRow): string | null {
  const { sourceId, slug } = job.payload
  if (typeof sourceId === 'string') return sourceId
  if (typeof slug === 'string') return splitSource(slug)?.source.id ?? null
  return null
}

export function blockedSources(): Effect.Effect<string[]> {
  return Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    const map = yield* Ref.get(states)
    return [...map].filter(([, state]) => state.openUntil > now).map(([id]) => id)
  })
}

export function recordSuccess(id: string | null): Effect.Effect<void> {
  if (!id) return Effect.void
  return Ref.update(states, map => HashMap.set(map, id, { failures: 0, openUntil: 0 }))
}

export function recordFailure(id: string | null): Effect.Effect<boolean> {
  if (!id) return Effect.succeed(false)
  return Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    return yield* Ref.modify(states, map => {
      const previous = HashMap.get(map, id)
      const state = Option.isSome(previous) ? previous.value : { failures: 0, openUntil: 0 }
      if (state.openUntil > now) return [false, map]
      const failures = state.failures + 1
      if (failures < BREAKER_THRESHOLD) {
        return [false, HashMap.set(map, id, { failures, openUntil: 0 })]
      }
      return [true, HashMap.set(map, id, { failures: 0, openUntil: now + BREAKER_OPEN_MS })]
    })
  })
}

export function resetSources(): Effect.Effect<void> {
  return Ref.set(states, HashMap.empty<string, GuardState>())
}

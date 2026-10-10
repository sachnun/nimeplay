import { beforeEach, describe, expect, test } from 'bun:test'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import type { JobRow } from '../../database/schema'
import { blockedSources, recordFailure, recordSuccess, resetSources, sourceOf } from './guard'

function job(payload: Record<string, unknown>): JobRow {
  return { payload } as unknown as JobRow
}

describe('sourceOf', () => {
  test('prefers an explicit sourceId', () => {
    expect(sourceOf(job({ sourceId: 'otakudesu', slug: 'ylnime:foo' }))).toBe('otakudesu')
  })

  test('derives the source from a slug', () => {
    expect(sourceOf(job({ slug: 'otakudesu:naruto-episode-1' }))).toBe('otakudesu')
  })

  test('returns null for unknown or malformed payloads', () => {
    expect(sourceOf(job({ slug: 'unknown:foo' }))).toBeNull()
    expect(sourceOf(job({ slug: 'noseparator' }))).toBeNull()
    expect(sourceOf(job({}))).toBeNull()
    expect(sourceOf(job({ sourceId: 123 }))).toBeNull()
  })
})

describe('circuit breaker', () => {
  beforeEach(async () => {
    await Effect.runPromise(resetSources())
  })

  test('opens only after the failure threshold and resets on success', async () => {
    const id = 'breaker-open'
    await Effect.runPromise(
      Effect.gen(function* () {
        for (let i = 1; i < 8; i++) {
          expect(yield* recordFailure(id)).toBe(false)
          expect(yield* blockedSources()).not.toContain(id)
        }
        expect(yield* recordFailure(id)).toBe(true)
        expect(yield* blockedSources()).toContain(id)
        expect(yield* recordFailure(id)).toBe(false)
        yield* recordSuccess(id)
        expect(yield* blockedSources()).not.toContain(id)
        expect(yield* recordFailure(id)).toBe(false)
      }),
    )
  })

  test('ignores null ids', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        expect(yield* recordFailure(null)).toBe(false)
        yield* recordSuccess(null)
      }),
    )
  })

  test('tracks sources independently', async () => {
    const open = 'breaker-a'
    await Effect.runPromise(
      Effect.gen(function* () {
        for (let i = 0; i < 8; i++) yield* recordFailure(open)
        expect(yield* blockedSources()).toContain(open)
        expect(yield* blockedSources()).not.toContain('breaker-b')
      }),
    )
  })

  test('reopens after the cooldown elapses', async () => {
    const id = 'breaker-cooldown'
    await Effect.runPromise(
      Effect.gen(function* () {
        for (let i = 0; i < 8; i++) yield* recordFailure(id)
        expect(yield* blockedSources()).toContain(id)
        yield* TestClock.adjust('10 minutes')
        expect(yield* blockedSources()).not.toContain(id)
      }).pipe(Effect.provide(TestClock.layer())),
    )
  })
})

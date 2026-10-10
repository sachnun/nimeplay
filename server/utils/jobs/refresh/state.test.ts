import { beforeEach, describe, expect, test } from 'bun:test'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { acquireSync, releaseSync } from './state'

describe('sync guard', () => {
  beforeEach(async () => {
    await Effect.runPromise(releaseSync('test'))
  })

  test('acquires once and rejects a second acquire while held', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        expect(yield* acquireSync('test')).toBe(true)
        expect(yield* acquireSync('test')).toBe(false)
        yield* releaseSync('test')
        expect(yield* acquireSync('test')).toBe(true)
      }),
    )
  })

  test('releases after the stale window elapses', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        expect(yield* acquireSync('test')).toBe(true)
        yield* TestClock.adjust('3 minutes')
        expect(yield* acquireSync('test')).toBe(false)
        yield* TestClock.adjust('2 minutes')
        expect(yield* acquireSync('test')).toBe(true)
      }).pipe(Effect.provide(TestClock.layer())),
    )
  })
})

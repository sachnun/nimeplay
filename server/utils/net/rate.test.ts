import { describe, expect, test } from 'bun:test'
import { Effect, Exit, Fiber, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import { netStats, runGuarded } from './rate'

function fakeResponse(status: number, retryAfter?: string): Response {
  const headers = new Headers()
  if (retryAfter) headers.set('retry-after', retryAfter)
  return new Response('', { status, headers })
}

async function failing(): Promise<Response> {
  return fakeResponse(503)
}

describe('runGuarded', () => {
  test('returns the value when the status is accepted', async () => {
    const value = await Effect.runPromise(
      runGuarded({
        url: 'https://ok.test/a',
        task: async () => fakeResponse(200),
        timeoutMs: 1000,
        status: response => response.status,
      }),
    )
    expect(value.status).toBe(200)
  })

  test('retries retryable statuses then fails with the last status', async () => {
    let calls = 0
    const program = Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        Effect.exit(
          runGuarded({
            url: 'https://retry.test/a',
            task: async () => {
              calls++
              return fakeResponse(503)
            },
            timeoutMs: 1000,
            status: response => response.status,
          }),
        ),
      )
      yield* TestClock.adjust('30 seconds')
      return yield* Fiber.join(fiber)
    }).pipe(Effect.provide(TestClock.layer()))
    const exit = await Effect.runPromise(program)
    expect(Exit.isFailure(exit)).toBe(true)
    expect(calls).toBe(3)
    const stats = await Effect.runPromise(netStats())
    expect(stats.retries).toBeGreaterThan(0)
    expect(stats.failures).toBeGreaterThan(0)
  })

  test('does not retry non retryable statuses', async () => {
    let calls = 0
    const exit = await Effect.runPromiseExit(
      runGuarded({
        url: 'https://notfound.test/a',
        task: async () => {
          calls++
          return fakeResponse(404)
        },
        timeoutMs: 1000,
        status: response => (response.status === 404 ? null : response.status),
      }),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(calls).toBe(1)
  })

  test('times out a hanging task and retries it', async () => {
    let calls = 0
    const program = Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        Effect.exit(
          runGuarded({
            url: 'https://hang.test/a',
            task: signal =>
              new Promise((_, reject) => {
                calls++
                signal.addEventListener('abort', () => reject(new Error('aborted')))
              }),
            timeoutMs: 20,
            status: () => null,
          }),
        ),
      )
      yield* TestClock.adjust('30 seconds')
      return yield* Fiber.join(fiber)
    }).pipe(Effect.provide(TestClock.layer()))
    const exit = await Effect.runPromise(program)
    expect(Exit.isFailure(exit)).toBe(true)
    expect(calls).toBe(3)
  })

  test('opens the circuit after repeated failures and fails fast', async () => {
    const host = 'https://breaker.test'
    let calls = 0
    const task = async () => {
      calls++
      return fakeResponse(503)
    }
    for (let i = 0; i < 6; i++) {
      await Effect.runPromiseExit(
        runGuarded({ url: `${host}/a`, task, timeoutMs: 1000, status: r => r.status, attempts: 1 }),
      )
    }
    const before = calls
    const exit = await Effect.runPromiseExit(
      runGuarded({ url: `${host}/b`, task, timeoutMs: 1000, status: r => r.status, attempts: 1 }),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    expect(calls).toBe(before)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('circuit open')
    }
  })

  test('limits concurrent requests per host', async () => {
    const active = await Effect.runPromise(Ref.make(0))
    const peak = await Effect.runPromise(Ref.make(0))
    const task = async () => {
      await Effect.runPromise(
        Ref.update(active, current => {
          return current + 1
        }),
      )
      const current = await Effect.runPromise(Ref.get(active))
      await Effect.runPromise(Ref.update(peak, value => Math.max(value, current)))
      await new Promise(resolve => setTimeout(resolve, 30))
      await Effect.runPromise(Ref.update(active, value => value - 1))
      return fakeResponse(200)
    }
    const urls = Array.from({ length: 6 }, (_, i) => `https://limit.test/${i}`)
    await Effect.runPromise(
      Effect.forEach(
        urls,
        url => runGuarded({ url, task, timeoutMs: 2000, status: response => response.status }),
        { concurrency: 'unbounded', discard: true },
      ),
    )
    const max = await Effect.runPromise(Ref.get(peak))
    expect(max).toBeLessThanOrEqual(3)
  })

  test('propagates retry after into the backoff without hanging', async () => {
    let calls = 0
    const program = Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        Effect.exit(
          runGuarded({
            url: 'https://throttle.test/a',
            task: async () => {
              calls++
              return fakeResponse(429, '0')
            },
            timeoutMs: 1000,
            status: response => response.status,
          }),
        ),
      )
      yield* TestClock.adjust('30 seconds')
      return yield* Fiber.join(fiber)
    }).pipe(Effect.provide(TestClock.layer()))
    const exit = await Effect.runPromise(program)
    expect(Exit.isFailure(exit)).toBe(true)
    expect(calls).toBe(3)
  })

  test('keeps separate breakers per host', async () => {
    for (let i = 0; i < 6; i++) {
      await Effect.runPromiseExit(
        runGuarded({ url: 'https://host-a.test/a', task: failing, timeoutMs: 1000, status: r => r.status, attempts: 1 }),
      )
    }
    const value = await Effect.runPromise(
      runGuarded({
        url: 'https://host-b.test/a',
        task: async () => fakeResponse(200),
        timeoutMs: 1000,
        status: r => r.status,
      }),
    )
    expect(value.status).toBe(200)
  })

  test('runs concurrent guards without leaking fibers', async () => {
    const fiber = Effect.runFork(
      Effect.forEach(
        ['https://x.test/a', 'https://x.test/b'],
        url => runGuarded({ url, task: async () => fakeResponse(200), timeoutMs: 1000, status: r => r.status }),
        { concurrency: 'unbounded' },
      ),
    )
    const exit = await Effect.runPromise(Fiber.await(fiber))
    expect(Exit.isSuccess(exit)).toBe(true)
  })
})

describe('runGuarded with TestClock', () => {
  test('retries on a virtual clock without real waiting', async () => {
    let calls = 0
    const program = Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        Effect.exit(
          runGuarded({
            url: 'https://virtual.test/a',
            task: async () => {
              calls++
              return fakeResponse(503)
            },
            timeoutMs: 1000,
            status: response => response.status,
          }),
        ),
      )
      yield* TestClock.adjust('30 seconds')
      return yield* Fiber.join(fiber)
    }).pipe(Effect.provide(TestClock.layer()))

    const exit = await Effect.runPromise(program)
    expect(Exit.isFailure(exit)).toBe(true)
    expect(calls).toBe(3)
  })

  test('recovers when the virtual clock lets a retry succeed', async () => {
    let calls = 0
    const program = Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        runGuarded({
          url: 'https://virtual-recover.test/a',
          task: async () => {
            calls++
            return calls < 2 ? fakeResponse(503) : fakeResponse(200)
          },
          timeoutMs: 1000,
          status: response => response.status,
        }),
      )
      yield* TestClock.adjust('30 seconds')
      return yield* Fiber.join(fiber)
    }).pipe(Effect.provide(TestClock.layer()))

    const value = await Effect.runPromise(program)
    expect(value.status).toBe(200)
    expect(calls).toBe(2)
  })
})

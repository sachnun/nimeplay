import { describe, expect, test } from 'bun:test'
import { Effect } from 'effect'
import { sampleSpeed } from '#lib/shared/utils/mirror'
import { flushStreamTelemetry, observeStream, pendingStreamSamples } from './scores'

async function reset(): Promise<void> {
  await Effect.runPromise(flushStreamTelemetry())
}

describe('sampleSpeed', () => {
  test('converts bytes over milliseconds into bytes per second', () => {
    expect(sampleSpeed(2_000_000, 1000)).toBe(2_000_000)
    expect(sampleSpeed(1_000_000, 500)).toBe(2_000_000)
    expect(sampleSpeed(500_000, 2000)).toBe(250_000)
  })

  test('returns zero for unusable measurements', () => {
    expect(sampleSpeed(0, 1000)).toBe(0)
    expect(sampleSpeed(1000, 0)).toBe(0)
    expect(sampleSpeed(-1, 1000)).toBe(0)
    expect(sampleSpeed(Number.NaN, 1000)).toBe(0)
  })
})

describe('observeStream', () => {
  test('counts samples in memory without touching the database', async () => {
    await reset()
    await Effect.runPromise(observeStream({ server: 'a', quality: '720p', ok: true }))
    await Effect.runPromise(observeStream({ server: 'a', quality: '720p', ok: true }))
    expect(pendingStreamSamples()).toBe(2)
    await reset()
    expect(pendingStreamSamples()).toBe(0)
  })

  test('ignores samples without a server or quality', async () => {
    await reset()
    await Effect.runPromise(observeStream({ server: '', quality: '720p', ok: true }))
    await Effect.runPromise(observeStream({ server: 'mega', quality: '', ok: true }))
    expect(pendingStreamSamples()).toBe(0)
  })

  test('auto flushes once the sample budget is reached', async () => {
    await reset()
    for (let index = 0; index < 45; index++) {
      await Effect.runPromise(observeStream({ server: 'mega', quality: '720p', ok: true }))
    }
    expect(pendingStreamSamples()).toBeLessThan(45)
    await reset()
  })
})

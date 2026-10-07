import { describe, expect, test } from 'bun:test'
import { isRetryableStatus, withRetry } from './retry'

const NO_DELAY = { 'retry-after': '0' }

describe('isRetryableStatus', () => {
  test('treats throttling and server errors as retryable', () => {
    expect(isRetryableStatus(403)).toBe(true)
    expect(isRetryableStatus(408)).toBe(true)
    expect(isRetryableStatus(425)).toBe(true)
    expect(isRetryableStatus(429)).toBe(true)
    expect(isRetryableStatus(500)).toBe(true)
    expect(isRetryableStatus(502)).toBe(true)
    expect(isRetryableStatus(503)).toBe(true)
  })

  test('treats client errors and success as final', () => {
    expect(isRetryableStatus(200)).toBe(false)
    expect(isRetryableStatus(301)).toBe(false)
    expect(isRetryableStatus(400)).toBe(false)
    expect(isRetryableStatus(401)).toBe(false)
    expect(isRetryableStatus(404)).toBe(false)
  })
})

describe('withRetry', () => {
  test('returns the value immediately when no retry is needed', async () => {
    let calls = 0
    const value = await withRetry(async () => {
      calls++
      return { value: 'ok', retry: false }
    })
    expect(value).toBe('ok')
    expect(calls).toBe(1)
  })

  test('retries until the value is available', async () => {
    let calls = 0
    const value = await withRetry(async () => {
      calls++
      return calls < 2 ? { value: null, retry: true, headers: NO_DELAY } : { value: 'recovered', retry: false }
    })
    expect(value).toBe('recovered')
    expect(calls).toBe(2)
  })

  test('returns the last known value after exhausting retries', async () => {
    let calls = 0
    const value = await withRetry(async () => {
      calls++
      return { value: calls === 1 ? 'last' : null, retry: true, headers: NO_DELAY }
    })
    expect(value).toBe('last')
    expect(calls).toBe(5)
  })

  test('returns null when every attempt fails without a value', async () => {
    let calls = 0
    const value = await withRetry(async () => {
      calls++
      return { value: null, retry: true, headers: new Headers(NO_DELAY) }
    })
    expect(value).toBeNull()
    expect(calls).toBe(5)
  })

  test('propagates thrown errors', async () => {
    await expect(
      withRetry(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
  })
})

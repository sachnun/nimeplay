import { describe, expect, test } from 'bun:test'
import { isRetryableStatus } from './rate'

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

import { describe, expect, test } from 'bun:test'
import type { JobRow } from '../../database/schema'
import { blockedSources, recordFailure, recordSuccess, sourceOf } from './guard'

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
  test('opens only after the failure threshold and resets on success', () => {
    const id = 'breaker-open'
    for (let i = 1; i < 8; i++) {
      expect(recordFailure(id)).toBe(false)
      expect(blockedSources()).not.toContain(id)
    }
    expect(recordFailure(id)).toBe(true)
    expect(blockedSources()).toContain(id)
    expect(recordFailure(id)).toBe(false)
    recordSuccess(id)
    expect(blockedSources()).not.toContain(id)
    expect(recordFailure(id)).toBe(false)
  })

  test('ignores null ids', () => {
    expect(recordFailure(null)).toBe(false)
    expect(() => recordSuccess(null)).not.toThrow()
  })

  test('tracks sources independently', () => {
    const open = 'breaker-a'
    for (let i = 0; i < 8; i++) recordFailure(open)
    expect(blockedSources()).toContain(open)
    expect(blockedSources()).not.toContain('breaker-b')
  })
})

import { describe, expect, test } from 'bun:test'
import { mirrorPriorityScore, qualityRank, qualityScore, sourcePriority, sourcePriorityScore } from './mirror'

describe('sourcePriority', () => {
  test('ranks known groups by order', () => {
    expect(sourcePriority('animeverse')).toBe(0)
    expect(sourcePriority('nekoclouds')).toBe(0)
    expect(sourcePriority('puterin')).toBe(1)
    expect(sourcePriority('pixeldrain')).toBe(2)
    expect(sourcePriority('mega')).toBe(7)
    expect(sourcePriority('filedon')).toBe(8)
  })

  test('matches substrings and ignores case and padding', () => {
    expect(sourcePriority('  AnimeVerse  ')).toBe(0)
    expect(sourcePriority('cdn.pixeldrain.com')).toBe(2)
    expect(sourcePriority('MY-MEGA-HOST')).toBe(7)
  })

  test('returns the group count for unknown sources', () => {
    expect(sourcePriority('unknown-host')).toBe(9)
    expect(sourcePriority('')).toBe(9)
  })
})

describe('qualityRank', () => {
  test('orders known qualities', () => {
    expect(qualityRank('1080p')).toBe(0)
    expect(qualityRank('720p')).toBe(1)
    expect(qualityRank('480p')).toBe(2)
    expect(qualityRank('360p')).toBe(3)
  })

  test('returns 99 for unknown qualities', () => {
    expect(qualityRank('144p')).toBe(99)
    expect(qualityRank('4k')).toBe(99)
    expect(qualityRank('')).toBe(99)
  })
})

describe('qualityScore', () => {
  test('maps the best quality to one and the worst to zero', () => {
    expect(qualityScore('1080p')).toBe(1)
    expect(qualityScore('360p')).toBe(0)
  })

  test('interpolates between known qualities', () => {
    expect(qualityScore('720p')).toBeCloseTo(2 / 3)
    expect(qualityScore('480p')).toBeCloseTo(1 / 3)
  })

  test('treats unknown qualities as the lowest score', () => {
    expect(qualityScore('144p')).toBe(0)
  })
})

describe('sourcePriorityScore', () => {
  test('gives the top group the maximum score', () => {
    expect(sourcePriorityScore('animeverse')).toBe(1)
  })

  test('gives unknown hosts the minimum score', () => {
    expect(sourcePriorityScore('unknown-host')).toBe(0)
  })

  test('decreases as the group rank grows', () => {
    expect(sourcePriorityScore('puterin')).toBeGreaterThan(sourcePriorityScore('mega'))
    expect(sourcePriorityScore('mega')).toBeGreaterThan(sourcePriorityScore('filedon'))
  })
})

describe('mirrorPriorityScore', () => {
  test('stays within the unit interval', () => {
    const score = mirrorPriorityScore({ server: 'animeverse', quality: '1080p' })
    expect(score).toBeLessThanOrEqual(1)
    expect(score).toBeGreaterThanOrEqual(0)
  })

  test('rewards higher priority servers and qualities', () => {
    const best = mirrorPriorityScore({ server: 'animeverse', quality: '1080p' })
    const worst = mirrorPriorityScore({ server: 'filedon', quality: '360p' })
    expect(best).toBeGreaterThan(worst)
  })

  test('falls back to the server score without a quality', () => {
    expect(mirrorPriorityScore({ server: 'animeverse' })).toBe(1)
    expect(mirrorPriorityScore({ server: 'unknown-host' })).toBe(0)
  })
})

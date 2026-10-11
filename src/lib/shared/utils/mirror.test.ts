import { describe, expect, test } from 'bun:test'
import { qualityRank, sourcePriority } from './mirror'

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

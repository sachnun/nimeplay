import { describe, expect, test } from 'bun:test'
import { BLOCKED_GENRE_SLUGS, PAGE_SIZE, formatSeason } from './shared'

describe('constants', () => {
  test('exposes the page size and blocked genres', () => {
    expect(PAGE_SIZE).toBe(24)
    expect(BLOCKED_GENRE_SLUGS).toEqual(['hentai'])
  })
})

describe('formatSeason', () => {
  test('title cases the season and appends the year', () => {
    expect(formatSeason('winter', 2024)).toBe('Winter 2024')
    expect(formatSeason('fall', 1999)).toBe('Fall 1999')
  })

  test('title cases multi word seasons', () => {
    expect(formatSeason('spring', 2024)).toBe('Spring 2024')
  })

  test('handles a missing year', () => {
    expect(formatSeason('summer', null)).toBe('Summer')
  })

  test('handles a missing season', () => {
    expect(formatSeason(null, 2024)).toBe('2024')
    expect(formatSeason(null, null)).toBe('')
  })
})

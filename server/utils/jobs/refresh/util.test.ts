import { describe, expect, test } from 'bun:test'
import { chunkValues, episodeNumber } from './util'

describe('chunkValues', () => {
  test('splits values into fixed size chunks', () => {
    expect(chunkValues([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  test('returns one chunk when the size exceeds the length', () => {
    expect(chunkValues([1, 2], 10)).toEqual([[1, 2]])
  })

  test('handles an empty array', () => {
    expect(chunkValues([], 3)).toEqual([])
  })

  test('keeps every value exactly once', () => {
    const values = Array.from({ length: 25 }, (_, index) => index)
    expect(chunkValues(values, 4).flat()).toEqual(values)
  })
})

describe('episodeNumber', () => {
  test('parses slug and title formats', () => {
    expect(episodeNumber('naruto-episode-12')).toBe(12)
    expect(episodeNumber('Naruto Episode 7')).toBe(7)
  })

  test('returns null when no episode number is present', () => {
    expect(episodeNumber('naruto')).toBeNull()
    expect(episodeNumber('')).toBeNull()
  })
})

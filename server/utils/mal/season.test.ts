import { describe, expect, test } from 'bun:test'
import { malSearchVariants, seasonNumber } from './season'

describe('seasonNumber', () => {
  test('parses explicit season markers', () => {
    expect(seasonNumber('Bleach Season 2')).toBe(2)
    expect(seasonNumber('Bleach 2nd Season')).toBe(2)
    expect(seasonNumber('Bleach Part 3')).toBe(3)
    expect(seasonNumber('Bleach S4')).toBe(4)
  })

  test('parses localized markers', () => {
    expect(seasonNumber('Temporada 2')).toBe(2)
    expect(seasonNumber('Saison 3')).toBe(3)
    expect(seasonNumber('Staffel 4')).toBe(4)
  })

  test('parses ordinals and words', () => {
    expect(seasonNumber('Bleach Third Season')).toBe(3)
    expect(seasonNumber('Bleach 5th')).toBe(5)
  })

  test('parses roman numerals', () => {
    expect(seasonNumber('Bleach II')).toBe(2)
    expect(seasonNumber('Bleach XII')).toBe(12)
  })

  test('parses japanese season markers', () => {
    expect(seasonNumber('Bleach Sono Ni')).toBe(2)
    expect(seasonNumber('Bleach Ni no Shou')).toBe(2)
  })

  test('returns null when no season marker is present', () => {
    expect(seasonNumber('Naruto')).toBeNull()
  })
})

describe('malSearchVariants', () => {
  test('always includes the original title first', () => {
    const variants = malSearchVariants('Jujutsu Kaisen')
    expect(variants[0]).toBe('Jujutsu Kaisen')
  })

  test('expands numbered seasons into ordinal and roman forms', () => {
    const variants = malSearchVariants('Jujutsu Kaisen Season 2')
    expect(variants).toContain('Jujutsu Kaisen Second')
    expect(variants).toContain('Jujutsu Kaisen II')
    expect(variants).toContain('Jujutsu Kaisen 2')
    expect(variants).toContain('Jujutsu Kaisen')
  })

  test('strips bracket annotations', () => {
    expect(malSearchVariants('Naruto [BD] (1080p)')).toContain('Naruto')
  })

  test('deduplicates and caps the variant list', () => {
    const variants = malSearchVariants('One Two Three Four Five Six Seven Eight Nine Ten')
    expect(variants.length).toBeLessThanOrEqual(8)
    expect(new Set(variants).size).toBe(variants.length)
  })

  test('handles empty titles', () => {
    expect(malSearchVariants('')).toEqual([])
  })
})

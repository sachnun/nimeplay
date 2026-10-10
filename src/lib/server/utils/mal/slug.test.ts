import { describe, expect, test } from 'bun:test'
import { normalizeSlugTitle } from './slug'

describe('normalizeSlugTitle', () => {
  test('strips the trailing slash and sub indo suffix', () => {
    expect(normalizeSlugTitle('wizard-barr-subtitle-indonesia/')).toBe('wizard barr')
    expect(normalizeSlugTitle('app-ranman-sub-indo/')).toBe('app ranman')
    expect(normalizeSlugTitle('dimensi-w-subtitle-indonesia/')).toBe('dimensi w')
  })

  test('decodes percent encoded slug parts', () => {
    expect(normalizeSlugTitle('bang-dream-yume%e2%88%9emita-sub-indo')).toBe('bang dream yume∞mita')
  })

  test('keeps the season marker readable', () => {
    expect(normalizeSlugTitle('a-portrait-of-jianghu-bu-liang-ren-season-7')).toBe(
      'a portrait of jianghu bu liang ren season 7',
    )
  })

  test('removes bracket noise and punctuation', () => {
    expect(normalizeSlugTitle('fate-zero-s1-s2')).toBe('fate zero s1 s2')
    expect(normalizeSlugTitle('avatar-the-legend-of-aangS')).toBe('avatar the legend of aangS')
  })

  test('collapses whitespace and trims', () => {
    expect(normalizeSlugTitle('  some---slug__here  ')).toBe('some slug here')
  })

  test('handles malformed percent escapes without throwing', () => {
    expect(normalizeSlugTitle('broken-%zz-title')).toBe('broken %zz title')
  })
})

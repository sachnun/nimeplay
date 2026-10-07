import { describe, expect, test } from 'bun:test'
import {
  baseTitle,
  bracketVariants,
  cleanTitle,
  isMovieTitle,
  isSeasonTitle,
  isSpinoffTitle,
  movieSeasonClash,
  normalizeTitleKey,
  tokenizeTitle,
} from './title'

describe('normalizeTitleKey', () => {
  test('strips case, accents and punctuation', () => {
    expect(normalizeTitleKey('Ünïcødé! 123')).toBe('unicde123')
    expect(normalizeTitleKey('Attack on Titan')).toBe('attackontitan')
  })

  test('returns an empty string for symbol-only input', () => {
    expect(normalizeTitleKey('!!! ???')).toBe('')
  })
})

describe('cleanTitle', () => {
  test('removes bracket annotations', () => {
    expect(cleanTitle('Naruto [BD] (1080p)')).toBe('Naruto')
  })

  test('removes subtitle suffixes', () => {
    expect(cleanTitle('Naruto Subtitle Indonesia')).toBe('Naruto')
    expect(cleanTitle('Naruto Sub Indo')).toBe('Naruto')
  })

  test('collapses whitespace', () => {
    expect(cleanTitle('  Naruto   Shippuuden  ')).toBe('Naruto Shippuuden')
  })
})

describe('baseTitle', () => {
  test('removes trailing season markers', () => {
    expect(baseTitle('Naruto Season 2')).toBe('Naruto')
    expect(baseTitle('Naruto 2nd Season')).toBe('Naruto')
    expect(baseTitle('Naruto Part 3')).toBe('Naruto')
    expect(baseTitle('Naruto S4')).toBe('Naruto')
  })

  test('keeps titles without season markers intact', () => {
    expect(baseTitle('Naruto')).toBe('Naruto')
  })
})

describe('tokenizeTitle', () => {
  test('drops stopwords and short tokens', () => {
    expect(tokenizeTitle('The Attack on Titan Movie')).toEqual(['attack', 'titan'])
  })

  test('normalizes accents', () => {
    expect(tokenizeTitle('Béryllium')).toEqual(['beryllium'])
  })
})

describe('bracketVariants', () => {
  test('returns the original plus cleaned and inner annotations', () => {
    expect(bracketVariants('Naruto [BD] (1080p)')).toEqual(['Naruto [BD] (1080p)', 'Naruto', '1080p'])
  })

  test('deduplicates variants', () => {
    const variants = bracketVariants('Naruto (Naruto)')
    expect(new Set(variants).size).toBe(variants.length)
  })
})

describe('isSpinoffTitle', () => {
  test('detects spinoff markers only on the candidate', () => {
    expect(isSpinoffTitle('Naruto OVA', 'Naruto')).toBe(true)
    expect(isSpinoffTitle('Naruto Specials', 'Naruto')).toBe(true)
    expect(isSpinoffTitle('Naruto Recap', 'Naruto')).toBe(true)
  })

  test('ignores markers shared by both titles', () => {
    expect(isSpinoffTitle('Naruto Specials', 'Naruto Specials')).toBe(false)
    expect(isSpinoffTitle('Naruto', 'Naruto Specials')).toBe(false)
  })

  test('is false when neither side carries a marker', () => {
    expect(isSpinoffTitle('Naruto', 'Naruto')).toBe(false)
  })
})

describe('isMovieTitle and isSeasonTitle', () => {
  test('detects movie markers', () => {
    expect(isMovieTitle('Naruto the Movie')).toBe(true)
    expect(isMovieTitle('Naruto')).toBe(false)
  })

  test('detects season markers', () => {
    expect(isSeasonTitle('Naruto Season 2')).toBe(true)
    expect(isSeasonTitle('Naruto')).toBe(false)
  })
})

describe('movieSeasonClash', () => {
  test('flags a movie MAL entry matched against a season site title', () => {
    expect(movieSeasonClash('Naruto Season 2', 'Naruto the Movie')).toBe(true)
  })

  test('is false when both or neither are movies', () => {
    expect(movieSeasonClash('Naruto the Movie', 'Naruto the Movie')).toBe(false)
    expect(movieSeasonClash('Naruto', 'Naruto')).toBe(false)
  })
})

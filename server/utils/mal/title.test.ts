import { describe, expect, test } from 'bun:test'
import { cleanTitle, isMovieTitle, isSeasonTitle, movieSeasonClash, normalizeTitleKey } from './title'

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

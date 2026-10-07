import { describe, expect, test } from 'bun:test'
import { decodeEntities, rankMalAnimeMatches, stripHtml, titleOf, titlesOf } from './matching'
import type { MalSearchEntry } from './types'

describe('decodeEntities', () => {
  test('decodes common html entities', () => {
    expect(decodeEntities('&#039;x&quot; &amp; &mdash; &ndash;')).toBe('\'x" & — –')
    expect(decodeEntities('&apos;')).toBe("'")
  })

  test('trims surrounding whitespace', () => {
    expect(decodeEntities('  Naruto  ')).toBe('Naruto')
  })
})

describe('stripHtml', () => {
  test('converts breaks to newlines and removes tags', () => {
    expect(stripHtml('a<br>b<br/>c<i>d</i>')).toBe('a\nb\ncd')
  })
})

describe('titleOf', () => {
  test('prefers english, then romaji, then native', () => {
    expect(titleOf({ english: 'E', romaji: 'R', native: 'N' })).toBe('E')
    expect(titleOf({ romaji: 'R', native: 'N' })).toBe('R')
    expect(titleOf({ native: 'N' })).toBe('N')
  })

  test('decodes entities in the chosen title', () => {
    expect(titleOf({ english: 'A &amp; B' })).toBe('A & B')
  })
})

describe('titlesOf', () => {
  test('collects, decodes and deduplicates titles', () => {
    expect(titlesOf({ english: 'Naruto', romaji: 'Naruto', native: 'ナルト' })).toEqual(['Naruto', 'ナルト'])
  })

  test('drops empty values', () => {
    expect(titlesOf({ english: '', romaji: '   ' })).toEqual([])
  })
})

const entries: MalSearchEntry[] = [
  { id: 1, title: 'Naruto', titles: ['Naruto'], format: 'TV' },
  { id: 2, title: 'Naruto: Shippuuden', titles: ['Naruto: Shippuuden'], format: 'TV' },
  { id: 3, title: 'Bleach', titles: ['Bleach'], format: 'TV' },
  { id: 4, title: 'Naruto the Movie', titles: ['Naruto the Movie'], format: 'MOVIE' },
]

describe('rankMalAnimeMatches', () => {
  test('keeps matching entries and drops unrelated ones', () => {
    const ids = rankMalAnimeMatches('Naruto', entries).map(entry => entry.id)
    expect(ids).toContain(1)
    expect(ids).not.toContain(3)
  })

  test('returns an empty list when nothing matches', () => {
    expect(rankMalAnimeMatches('ZZZ Unknown Title', entries)).toEqual([])
  })

  test('does not match a movie entry against a season site title', () => {
    const ids = rankMalAnimeMatches('Naruto Season 2', entries).map(entry => entry.id)
    expect(ids).not.toContain(4)
  })

  test('handles entries without a titles array', () => {
    const minimal: MalSearchEntry[] = [{ id: 9, title: 'Naruto', titles: [] }]
    expect(rankMalAnimeMatches('Naruto', minimal).map(entry => entry.id)).toEqual([9])
  })
})

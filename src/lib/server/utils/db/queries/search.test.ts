import { describe, expect, test } from 'bun:test'
import { searchTokens, toAnyFtsQuery, toFtsQuery } from './search'

describe('searchTokens', () => {
  test('splits on punctuation and keeps letters and numbers', () => {
    expect(searchTokens('asuna yuki')).toEqual(['asuna', 'yuki'])
    expect(searchTokens('steins;gate 0')).toEqual(['steins', 'gate', '0'])
    expect(searchTokens('  ')).toEqual([])
  })

  test('keeps unicode letters', () => {
    expect(searchTokens('ソード アート')).toEqual(['ソード', 'アート'])
  })

  test('caps the token count at five', () => {
    expect(searchTokens('a b c d e f g')).toHaveLength(5)
  })
})

describe('toFtsQuery', () => {
  test('builds an and query with prefix matching', () => {
    expect(toFtsQuery(['asuna', 'yuki'])).toBe('asuna:* & yuki:*')
  })

  test('returns null without tokens', () => {
    expect(toFtsQuery([])).toBeNull()
  })
})

describe('toAnyFtsQuery', () => {
  test('builds an or query with prefix matching', () => {
    expect(toAnyFtsQuery(['asuna', 'yuki'])).toBe('asuna:* | yuki:*')
  })

  test('returns null without tokens', () => {
    expect(toAnyFtsQuery([])).toBeNull()
  })
})

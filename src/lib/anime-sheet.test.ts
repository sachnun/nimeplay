import { describe, expect, test } from 'bun:test'
import { ANIME_SHEET_DETAIL_RE, isAnimeSheetDevice } from './anime-sheet'

describe('ANIME_SHEET_DETAIL_RE', () => {
  test('matches detail routes with an optional trailing slash', () => {
    expect(ANIME_SHEET_DETAIL_RE.test('/anime/5')).toBe(true)
    expect(ANIME_SHEET_DETAIL_RE.test('/anime/5/')).toBe(true)
    expect(ANIME_SHEET_DETAIL_RE.test('/anime/12345')).toBe(true)
  })

  test('rejects episode and unrelated routes', () => {
    expect(ANIME_SHEET_DETAIL_RE.test('/anime/5/1')).toBe(false)
    expect(ANIME_SHEET_DETAIL_RE.test('/genre/action')).toBe(false)
    expect(ANIME_SHEET_DETAIL_RE.test('/')).toBe(false)
  })
})

describe('isAnimeSheetDevice', () => {
  test('is false outside the browser', () => {
    expect(isAnimeSheetDevice()).toBe(false)
  })
})

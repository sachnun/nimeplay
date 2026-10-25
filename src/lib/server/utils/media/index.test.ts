import { describe, expect, test } from 'bun:test'
import { mediaRef, isValidMediaKey, posterSrc } from './index'

describe('isValidMediaKey', () => {
  test('accepts known media folders', () => {
    expect(isValidMediaKey('posters/abcd.webp')).toBe(true)
    expect(isValidMediaKey('characters/ab_cd.webp')).toBe(true)
    expect(isValidMediaKey('voiceactors/ABC-123.webp')).toBe(true)
  })

  test('rejects unknown folders and traversal', () => {
    expect(isValidMediaKey('')).toBe(false)
    expect(isValidMediaKey('secrets/abcd.webp')).toBe(false)
    expect(isValidMediaKey('posters/../../etc/passwd')).toBe(false)
    expect(isValidMediaKey('/posters/abcd.webp')).toBe(false)
    expect(isValidMediaKey('posters/abcd.webp?x=1')).toBe(false)
  })
})

describe('posterSrc', () => {
  test('returns an empty string for missing values', () => {
    expect(posterSrc(null)).toBe('')
    expect(posterSrc(undefined)).toBe('')
    expect(posterSrc('')).toBe('')
  })

  test('keeps external urls as they are', () => {
    expect(posterSrc('https://cdn.myanimelist.net/images/1.jpg')).toBe('https://cdn.myanimelist.net/images/1.jpg')
    expect(posterSrc('/api/image?id=1')).toBe('/api/image?id=1')
  })

  test('maps media paths to the media route', () => {
    expect(posterSrc('/media/posters/abcd.webp')).toBe('/media/posters/abcd.webp')
    expect(posterSrc('posters/abcd.webp')).toBe('/media/posters/abcd.webp')
  })
})

describe('mediaRef', () => {
  test('builds a random key per media type', () => {
    const poster = mediaRef('https://cdn.example/p.jpg', 'posters')
    const character = mediaRef('https://cdn.example/c.jpg', 'characters')
    expect(poster?.sourceUrl).toBe('https://cdn.example/p.jpg')
    expect(poster?.key).toMatch(/^posters\/[0-9a-f]{32}\.webp$/)
    expect(character?.key).toMatch(/^characters\/[0-9a-f]{32}\.webp$/)
    expect(poster?.key).not.toBe(mediaRef('https://cdn.example/p.jpg', 'posters')?.key)
  })

  test('rejects missing and non http urls', () => {
    expect(mediaRef(null, 'posters')).toBeNull()
    expect(mediaRef('', 'posters')).toBeNull()
    expect(mediaRef('/relative.jpg', 'posters')).toBeNull()
    expect(mediaRef('ftp://cdn.example/p.jpg', 'posters')).toBeNull()
  })
})

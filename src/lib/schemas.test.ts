import { describe, expect, test } from 'bun:test'
import { animePageSchema, episodeSchema, genrePageSchema, malIdSchema, searchSchema } from './schemas'

describe('searchSchema', () => {
  test('accepts a query with and without a genre', () => {
    expect(searchSchema.parse({ query: 'kaguya' })).toEqual({ query: 'kaguya' })
    expect(searchSchema.parse({ query: 'kaguya', genreSlug: 'romance' })).toEqual({
      query: 'kaguya',
      genreSlug: 'romance',
    })
    expect(searchSchema.parse({ query: '' })).toEqual({ query: '' })
  })

  test('rejects non objects and bad genre values', () => {
    expect(searchSchema.safeParse('kaguya').success).toBe(false)
    expect(searchSchema.safeParse({ query: 42 }).success).toBe(false)
    expect(searchSchema.safeParse({ query: 'kaguya', genreSlug: 1 }).success).toBe(false)
  })
})

describe('animePageSchema', () => {
  test('accepts a known status and a positive page', () => {
    expect(animePageSchema.parse({ status: 'ONGOING', page: 1 })).toEqual({ status: 'ONGOING', page: 1 })
    expect(animePageSchema.parse({ status: 'COMPLETED', page: 7 }).status).toBe('COMPLETED')
  })

  test('rejects unknown statuses and bad pages', () => {
    expect(animePageSchema.safeParse({ status: 'ongoing', page: 1 }).success).toBe(false)
    expect(animePageSchema.safeParse({ status: 'ONGOING', page: 0 }).success).toBe(false)
    expect(animePageSchema.safeParse({ status: 'ONGOING', page: 1.5 }).success).toBe(false)
    expect(animePageSchema.safeParse({ status: 'ONGOING', page: '1' }).success).toBe(false)
  })
})

describe('genrePageSchema', () => {
  test('accepts a slug and page', () => {
    expect(genrePageSchema.parse({ slug: 'sci-fi', page: 2 })).toEqual({ slug: 'sci-fi', page: 2 })
  })

  test('rejects an empty slug and bad pages', () => {
    expect(genrePageSchema.safeParse({ slug: '', page: 1 }).success).toBe(false)
    expect(genrePageSchema.safeParse({ slug: 'action', page: -1 }).success).toBe(false)
  })
})

describe('malIdSchema', () => {
  test('accepts zero so the loader can redirect', () => {
    expect(malIdSchema.parse({ malId: 0 })).toEqual({ malId: 0 })
    expect(malIdSchema.parse({ malId: 60597 }).malId).toBe(60597)
  })

  test('rejects negatives and non integers', () => {
    expect(malIdSchema.safeParse({ malId: -1 }).success).toBe(false)
    expect(malIdSchema.safeParse({ malId: 1.2 }).success).toBe(false)
  })
})

describe('episodeSchema', () => {
  test('defaults stream to true and keeps optional picks absent', () => {
    expect(episodeSchema.parse({ malId: 1, episodeNumber: 3 })).toEqual({
      malId: 1,
      episodeNumber: 3,
      stream: true,
    })
  })

  test('accepts server and quality overrides', () => {
    const parsed = episodeSchema.parse({ malId: 1, episodeNumber: 3, server: 'mega', quality: '720p', stream: false })
    expect(parsed).toEqual({ malId: 1, episodeNumber: 3, server: 'mega', quality: '720p', stream: false })
  })

  test('rejects non positive ids and episodes', () => {
    expect(episodeSchema.safeParse({ malId: 0, episodeNumber: 1 }).success).toBe(false)
    expect(episodeSchema.safeParse({ malId: 1, episodeNumber: 0 }).success).toBe(false)
  })
})

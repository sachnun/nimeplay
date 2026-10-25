import { describe, expect, test } from 'bun:test'
import { extractBlogger, isBlogger } from './blogger'

describe('isBlogger', () => {
  test('matches blogger and blogspot video embeds', () => {
    expect(isBlogger('https://www.blogger.com/video.g?token=abc')).toBe(true)
    expect(isBlogger('https://blogspot.com/video.g?token=abc')).toBe(true)
    expect(isBlogger('https://example.com/video.g?token=abc')).toBe(false)
  })
})

describe('extractBlogger', () => {
  test('returns null without a token', async () => {
    expect(await extractBlogger('https://www.blogger.com/video.g', '')).toBeNull()
  })

  test('returns null for an unparsable url', async () => {
    expect(await extractBlogger('not a url', '')).toBeNull()
  })

  test('returns null when the page cannot be fetched', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async () => new Response('', { status: 500 })) as unknown as typeof fetch
    try {
      expect(await extractBlogger('https://www.blogger.com/video.g?token=abc', '')).toBeNull()
    } finally {
      globalThis.fetch = original
    }
  })
})

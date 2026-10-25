import { describe, expect, test } from 'bun:test'
import { extractHydrax, isHydrax } from './hydrax'

describe('isHydrax', () => {
  test('matches abyss and hydrax hosts', () => {
    expect(isHydrax('https://abyssplayer.com/e/abc')).toBe(true)
    expect(isHydrax('https://abysscdn.com/?v=abc')).toBe(true)
    expect(isHydrax('https://abyss.to/')).toBe(true)
    expect(isHydrax('https://hydrax.net/')).toBe(true)
    expect(isHydrax('https://example.com/')).toBe(false)
  })
})

describe('extractHydrax', () => {
  test('returns null without a datas payload', async () => {
    expect(await extractHydrax('https://abyss.to/e/abc', '<html></html>')).toBeNull()
  })

  test('returns null on an unparsable datas payload', async () => {
    expect(await extractHydrax('https://abyss.to/e/abc', 'const datas = "not-base64-json"')).toBeNull()
  })

  test('returns null when the payload misses required fields', async () => {
    const encoded = btoa(JSON.stringify({ slug: 'abc' }))
    expect(await extractHydrax('https://abyss.to/e/abc', `const datas = "${encoded}"`)).toBeNull()
  })

  test('returns null when the media blob cannot be decrypted', async () => {
    const encoded = btoa(JSON.stringify({ user_id: 1, slug: 'abc', md5_id: 2, media: 'AAAA' }))
    expect(await extractHydrax('https://abyss.to/e/abc', `const datas = "${encoded}"`)).toBeNull()
  })
})

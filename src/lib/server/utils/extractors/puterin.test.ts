import { describe, expect, test } from 'bun:test'
import { extractPuterin } from './puterin'

const EMBED = 'https://puterin.biz/e/abc'

describe('extractPuterin', () => {
  test('returns null without the px payload', async () => {
    expect(await extractPuterin(EMBED, '<html></html>')).toBeNull()
  })

  test('returns null on malformed px json', async () => {
    expect(await extractPuterin(EMBED, 'window.__PX = {n:"a",d:}')).toBeNull()
  })

  test('returns null when px lacks the payload fields', async () => {
    expect(await extractPuterin(EMBED, 'window.__PX = {"n":"abc"}')).toBeNull()
    expect(await extractPuterin(EMBED, 'window.__PX = {"d":"abc"}')).toBeNull()
  })

  test('returns null when the key request fails', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async () => new Response('', { status: 500 })) as unknown as typeof fetch
    try {
      expect(await extractPuterin(EMBED, 'window.__PX = {"n":"abc","d":"AAAA"}')).toBeNull()
    } finally {
      globalThis.fetch = original
    }
  })
})

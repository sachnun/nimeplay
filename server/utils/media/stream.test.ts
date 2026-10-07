import { beforeAll, describe, expect, test } from 'bun:test'
import {
  fromBase64Url,
  openStreamRequest,
  openStreamToken,
  proxiedStreamPath,
  sealStreamToken,
  sealedStreamUrl,
} from './stream'

const SECRET = '0123456789abcdef0123456789abcdef'

beforeAll(() => {
  process.env.NUXT_STREAM_SECRET = SECRET
})

describe('fromBase64Url', () => {
  test('decodes a known value', () => {
    expect([...fromBase64Url('aGVsbG8')]).toEqual([104, 101, 108, 108, 111])
  })

  test('ignores invalid characters', () => {
    expect([...fromBase64Url('!!!invalid!!!')]).toEqual([...fromBase64Url('invalid')])
  })

  test('handles an empty string', () => {
    expect(fromBase64Url('').length).toBe(0)
  })
})

describe('sealStreamToken and openStreamToken', () => {
  test('round trips the url', async () => {
    const token = await sealStreamToken('https://cdn.example/v.mp4', 60_000)
    expect(await openStreamToken(token)).toBe('https://cdn.example/v.mp4')
  })

  test('round trips headers and the mega key', async () => {
    const token = await sealStreamToken('https://cdn.example/v.mp4', 60_000, { Referer: 'https://r/' }, 'megakey')
    expect(await openStreamRequest(token)).toEqual({
      url: 'https://cdn.example/v.mp4',
      headers: { Referer: 'https://r/' },
      megaKey: 'megakey',
    })
  })

  test('defaults headers to an empty object', async () => {
    const token = await sealStreamToken('https://cdn.example/v.mp4', 60_000)
    expect((await openStreamRequest(token))?.headers).toEqual({})
  })

  test('supports tokens without expiry', async () => {
    const token = await sealStreamToken('https://cdn.example/v.mp4')
    expect(await openStreamToken(token)).toBe('https://cdn.example/v.mp4')
  })

  test('rejects expired tokens', async () => {
    const token = await sealStreamToken('https://cdn.example/v.mp4', -1000)
    expect(await openStreamToken(token)).toBeNull()
  })

  test('rejects tampered and malformed tokens', async () => {
    const token = await sealStreamToken('https://cdn.example/v.mp4', 60_000)
    const index = Math.floor(token.length / 2)
    const flipped = `${token.slice(0, index)}${token[index] === 'A' ? 'B' : 'A'}${token.slice(index + 1)}`
    expect(flipped).not.toBe(token)
    expect(await openStreamToken(flipped)).toBeNull()
    expect(await openStreamToken('not-a-token')).toBeNull()
    expect(await openStreamToken('')).toBeNull()
  })

  test('produces a fresh token each time', async () => {
    const first = await sealStreamToken('https://cdn.example/v.mp4', 60_000)
    const second = await sealStreamToken('https://cdn.example/v.mp4', 60_000)
    expect(first).not.toBe(second)
  })
})

describe('stream urls', () => {
  test('builds the proxied path', () => {
    expect(proxiedStreamPath('abc')).toBe('/api/stream?t=abc')
  })

  test('seals an absolute url resolved against a base', async () => {
    const sealed = await sealedStreamUrl('/rel/v.mp4', 'https://base.com/dir/')
    expect(sealed.startsWith('/api/stream?t=')).toBe(true)
    expect(await openStreamToken(sealed.slice('/api/stream?t='.length))).toBe('https://base.com/rel/v.mp4')
  })
})

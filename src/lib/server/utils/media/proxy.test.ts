import { describe, expect, test } from 'bun:test'
import { enableProxy, proxyUrl } from './proxy'

describe('proxyUrl', () => {
  test('leaves urls untouched while the proxy is disabled', () => {
    expect(proxyUrl('https://sokuja.net/a')).toBe('https://sokuja.net/a')
  })

  test('routes through the default pool when forced', () => {
    expect(proxyUrl('https://example.com/a.mp4', true)).toBe('http://unroxy.koyeb.app/sg/https://example.com/a.mp4')
  })

  test('uses the host override pool', () => {
    expect(proxyUrl('https://sokuja.net/a', true)).toBe('http://unroxy.koyeb.app/pl/https://sokuja.net/a')
    expect(proxyUrl('https://cdn.sokuja.uk/a', true)).toBe('http://unroxy.koyeb.app/pl/https://cdn.sokuja.uk/a')
  })

  test('bypasses blocked hosts', () => {
    for (const url of [
      'https://myanimelist.net/a',
      'https://cdn.malcdn.com/a',
      'https://mega.nz/file/a',
      'https://mega.co.nz/file/a',
      'https://user.github.io/a',
    ]) {
      expect(proxyUrl(url, true)).toBe(url)
    }
  })

  test('keeps regionless hosts out of the pool path', () => {
    expect(proxyUrl('https://anilist.co/graphql', true)).toBe('http://unroxy.koyeb.app/https://anilist.co/graphql')
  })

  test('does not treat a lookalike host as an override', () => {
    expect(proxyUrl('https://sokuja.net.evil.example/a', true)).toBe(
      'http://unroxy.koyeb.app/sg/https://sokuja.net.evil.example/a',
    )
  })

  test('returns unparsable input unchanged', () => {
    expect(proxyUrl('not a url', true)).toBe('not a url')
  })

  test('proxies without the force flag once enabled', () => {
    enableProxy()
    expect(proxyUrl('https://example.com/a')).toBe('http://unroxy.koyeb.app/sg/https://example.com/a')
    expect(proxyUrl('https://myanimelist.net/a')).toBe('https://myanimelist.net/a')
  })
})

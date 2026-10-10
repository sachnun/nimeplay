import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import {
  asHttpUrl,
  embedPageHeadersFor,
  extractAnimeverse,
  extractDesuDrive,
  extractDesuStream,
  extractFiledon,
  extractMoeplay,
  extractPixeldrain,
  extractYourupload,
  extractYuplod,
  isAnimeverse,
  isDesuDrive,
  isDesuStreamHd,
  isFiledon,
  isMoeplay,
  isPixeldrain,
  isPlaceholderStreamUrl,
  isYourupload,
  isYuplod,
  upstreamHeadersFor,
} from './hosts'

const spies: { mockRestore(): void }[] = []

function mockRandom(value: number): void {
  spies.push(spyOn(Math, 'random').mockReturnValue(value))
}

afterEach(() => {
  for (const spy of spies) spy.mockRestore()
  spies.length = 0
})

function filedonPage(payload: unknown): string {
  return `<div data-page="${JSON.stringify(payload).replace(/"/g, '&quot;')}"></div>`
}

describe('asHttpUrl', () => {
  test('rejects empty and non-http schemes', () => {
    expect(asHttpUrl(null)).toBeNull()
    expect(asHttpUrl(undefined)).toBeNull()
    expect(asHttpUrl('')).toBeNull()
    expect(asHttpUrl('   ')).toBeNull()
    expect(asHttpUrl('blob:https://x/y')).toBeNull()
    expect(asHttpUrl('data:video/mp4;base64,AAAA')).toBeNull()
    expect(asHttpUrl('javascript:alert(1)')).toBeNull()
    expect(asHttpUrl('ftp://x/y')).toBeNull()
  })

  test('accepts absolute http and https urls', () => {
    expect(asHttpUrl('https://a.com/x')).toBe('https://a.com/x')
    expect(asHttpUrl('http://a.com/x')).toBe('http://a.com/x')
  })

  test('resolves relative urls against a base', () => {
    expect(asHttpUrl('/rel/v.mp4', 'https://base.com/dir/')).toBe('https://base.com/rel/v.mp4')
    expect(asHttpUrl('v.mp4', 'https://base.com/dir/')).toBe('https://base.com/dir/v.mp4')
  })

  test('decodes html entities before parsing', () => {
    expect(asHttpUrl('https://a.com/x?a=1&amp;b=2')).toBe('https://a.com/x?a=1&b=2')
  })

  test('returns null for unparsable input without a base', () => {
    expect(asHttpUrl('/rel/v.mp4')).toBeNull()
  })
})

describe('isPlaceholderStreamUrl', () => {
  test('detects known placeholder hosts and filenames', () => {
    expect(isPlaceholderStreamUrl('https://x/novideo.mp4')).toBe(true)
    expect(isPlaceholderStreamUrl('https://x/bbb.mp4')).toBe(true)
    expect(isPlaceholderStreamUrl('https://samplelib.com/x.mp4')).toBe(true)
    expect(isPlaceholderStreamUrl('https://x/real-episode.mp4')).toBe(false)
  })

  test('handles empty input', () => {
    expect(isPlaceholderStreamUrl(null)).toBe(false)
    expect(isPlaceholderStreamUrl('')).toBe(false)
  })
})

describe('host predicates', () => {
  test('classify each supported host', () => {
    expect(isDesuStreamHd('https://desustream.me/x')).toBe(true)
    expect(isDesuStreamHd('https://other.com/x')).toBe(false)
    expect(isDesuDrive('/desudrive/x')).toBe(true)
    expect(isFiledon('https://filedon.co/x')).toBe(true)
    expect(isMoeplay('/moeplay/x')).toBe(true)
    expect(isYourupload('https://yourupload.com/x')).toBe(true)
    expect(isYuplod('https://yuplod.com/x')).toBe(true)
    expect(isAnimeverse('https://animeverse/x')).toBe(true)
    expect(isPixeldrain('https://pixeldrain.com/u/x')).toBe(true)
  })
})

describe('extractDesuStream', () => {
  const embed = 'https://desustream.me/e/abc'

  test('reads the videoURL assignment', async () => {
    expect(await extractDesuStream(embed, 'var videoURL = "https://cdn.example/v.mp4";')).toBe('https://cdn.example/v.mp4')
  })

  test('reads a source tag and resolves relative urls', async () => {
    expect(await extractDesuStream(embed, '<source src="https://cdn.example/s.mp4">')).toBe('https://cdn.example/s.mp4')
    expect(await extractDesuStream(embed, '<source src="/rel/v.mp4">')).toBe('https://desustream.me/rel/v.mp4')
  })

  test('skips placeholder urls and falls through', async () => {
    expect(await extractDesuStream(embed, 'var videoURL = "https://x/novideo.mp4";')).toBeNull()
  })

  test('returns null when nothing is found', async () => {
    expect(await extractDesuStream(embed, '<html></html>')).toBeNull()
  })
})

describe('extractFiledon', () => {
  const embed = 'https://filedon.co/x'

  test('reads the r2 cloudflare storage url', async () => {
    const html = filedonPage({ props: { url: 'https://abc.r2.cloudflarestorage.com/x.mp4' } })
    expect(await extractFiledon(embed, html)).toBe('https://abc.r2.cloudflarestorage.com/x.mp4')
  })

  test('rejects urls outside r2 storage', async () => {
    const html = filedonPage({ props: { url: 'https://evil.com/x.mp4' } })
    expect(await extractFiledon(embed, html)).toBeNull()
  })

  test('returns null for missing or malformed markup', async () => {
    expect(await extractFiledon(embed, '<html></html>')).toBeNull()
    expect(await extractFiledon(embed, '<div data-page="{oops}"></div>')).toBeNull()
  })
})

describe('extractDesuDrive', () => {
  const embed = 'https://x/desudrive/e/1'

  test('reads the otakudesu payload file field', async () => {
    const html = `otakudesu('{"file":"https://cdn.example/d.mp4"}')`
    expect(await extractDesuDrive(embed, html)).toBe('https://cdn.example/d.mp4')
  })

  test('rejects placeholder payloads', async () => {
    const html = `otakudesu('{"file":"https://x/novideo.mp4"}')`
    expect(await extractDesuDrive(embed, html)).toBeNull()
  })

  test('returns null when the payload is missing', async () => {
    expect(await extractDesuDrive(embed, '<html></html>')).toBeNull()
  })
})

describe('extractPixeldrain', () => {
  test('derives the direct api url from the embed id', async () => {
    expect(await extractPixeldrain('https://pixeldrain.com/u/AbC123', '')).toBe('https://pixeldrain.com/api/file/AbC123')
    expect(await extractPixeldrain('https://pixeldrain.com/api/file/AbC123', '')).toBe(
      'https://pixeldrain.com/api/file/AbC123',
    )
  })

  test('falls back to parsing the page when no id is present', async () => {
    expect(await extractPixeldrain('https://pixeldrain.com/e/x', '<source src="https://cdn.example/p.mp4">')).toBe(
      'https://cdn.example/p.mp4',
    )
  })
})

describe('extractMoeplay and extractYourupload', () => {
  test('parse generic source tags', async () => {
    expect(await extractMoeplay('https://x/moeplay/e/1', '<source src="https://cdn.example/m.mp4">')).toBe(
      'https://cdn.example/m.mp4',
    )
    expect(await extractYourupload('https://yourupload.com/e/1', 'file: "https://cdn.example/y.mp4"')).toBe(
      'https://cdn.example/y.mp4',
    )
  })

  test('extractAnimeverse tries both parsers', async () => {
    expect(await extractAnimeverse('https://animeverse/e/1', '<source src="https://cdn.example/a.mp4">')).toBe(
      'https://cdn.example/a.mp4',
    )
  })

  test('extractYuplod falls back when there is no nested iframe', async () => {
    expect(await extractYuplod('https://yuplod.com/e/1', 'file: "https://cdn.example/z.mp4"')).toBe(
      'https://cdn.example/z.mp4',
    )
  })
})

describe('upstreamHeadersFor', () => {
  test('uses host specific referers', () => {
    expect(upstreamHeadersFor('https://vidcache.net/x').Referer).toBe('https://www.yourupload.com/')
    expect(upstreamHeadersFor('https://nekoclouds.com/x').Referer).toBe('https://nekoclouds.com/')
  })

  test('falls back to the url origin', () => {
    expect(upstreamHeadersFor('https://foo.com/a/b').Referer).toBe('https://foo.com/')
  })

  test('includes range only when provided', () => {
    expect(upstreamHeadersFor('https://foo.com/x').Range).toBeUndefined()
    expect(upstreamHeadersFor('https://foo.com/x', 'bytes=0-1').Range).toBe('bytes=0-1')
  })
})

describe('embedPageHeadersFor', () => {
  test('requests an iframe navigation', () => {
    mockRandom(0)
    const headers = embedPageHeadersFor('https://foo.com/x')
    expect(headers['Sec-Fetch-Dest']).toBe('iframe')
    expect(headers['Sec-Fetch-Mode']).toBe('navigate')
    expect(headers['User-Agent']).toBeTruthy()
  })
})

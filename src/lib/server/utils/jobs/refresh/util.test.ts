import { describe, expect, test } from 'bun:test'
import { chunkValues, episodeNumber, resolveEpisodeNumber } from './util'
import { staleEpisodeIds } from './persist'

describe('chunkValues', () => {
  test('splits values into fixed size chunks', () => {
    expect(chunkValues([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  test('returns one chunk when the size exceeds the length', () => {
    expect(chunkValues([1, 2], 10)).toEqual([[1, 2]])
  })

  test('handles an empty array', () => {
    expect(chunkValues([], 3)).toEqual([])
  })

  test('keeps every value exactly once', () => {
    const values = Array.from({ length: 25 }, (_, index) => index)
    expect(chunkValues(values, 4).flat()).toEqual(values)
  })
})

describe('episodeNumber', () => {
  test('parses slug and title formats', () => {
    expect(episodeNumber('naruto-episode-12')).toBe(12)
    expect(episodeNumber('Naruto Episode 7')).toBe(7)
  })

  test('returns null when no episode number is present', () => {
    expect(episodeNumber('naruto')).toBeNull()
    expect(episodeNumber('')).toBeNull()
  })
})

describe('resolveEpisodeNumber', () => {
  test('prefers the title number over a drifted slug', () => {
    expect(
      resolveEpisodeNumber({
        title: 'FX Senshi Kurumi-chan Episode 5 Subtitle Indonesia',
        slug: 'fxskc-episode-4-sub-indo-2',
      }),
    ).toBe(5)
  })

  test('falls back to the slug when the title has no number', () => {
    expect(resolveEpisodeNumber({ title: 'FX Senshi Kurumi-chan', slug: 'fxskc-episode-45-sub-indo' })).toBe(45)
  })

  test('returns null when neither side is numbered', () => {
    expect(resolveEpisodeNumber({ title: 'Naruto', slug: 'naruto' })).toBeNull()
  })
})

function listedRows(entries: { title: string; slug: string; number: number }[]) {
  return entries.map(entry => ({
    entry: { title: entry.title, slug: entry.slug, date: '' },
    number: entry.number,
    slug: `otakudesu:${entry.slug}`,
  }))
}

describe('staleEpisodeIds', () => {
  const rows = listedRows

  test('drops a phantom episode left by a drifted slug', () => {
    const stored = [
      { id: 1, slug: 'otakudesu:fxskc-episode-45-sub-indo', number: 45, title: 'FX Senshi Kurumi-chan Episode 45' },
    ]
    const listed = rows([{ title: 'FX Senshi Kurumi-chan Episode 6 Subtitle Indonesia', slug: 'fxskc-episode-6-sub-indo', number: 6 }])
    expect(staleEpisodeIds(stored, listed)).toEqual([1])
  })

  test('keeps episodes that are still listed', () => {
    const stored = [{ id: 1, slug: 'otakudesu:fxskc-episode-6-sub-indo', number: 6, title: 'Episode 6' }]
    const listed = rows([{ title: 'FX Senshi Kurumi-chan Episode 6', slug: 'fxskc-episode-6-sub-indo', number: 6 }])
    expect(staleEpisodeIds(stored, listed)).toEqual([])
  })

  test('keeps unlisted episodes within the listed range', () => {
    const stored = [{ id: 1, slug: 'otakudesu:fxskc-episode-3-sub-indo', number: 3, title: 'Episode 3' }]
    const listed = rows([{ title: 'FX Senshi Kurumi-chan Episode 6', slug: 'fxskc-episode-6-sub-indo', number: 6 }])
    expect(staleEpisodeIds(stored, listed)).toEqual([])
  })

  test('drops an unlisted episode numbered above the latest listed one', () => {
    const stored = [{ id: 1, slug: 'otakudesu:stale', number: 45, title: 'Episode 45' }]
    const listed = rows([{ title: 'FX Senshi Kurumi-chan Episode 6', slug: 'fxskc-episode-6-sub-indo', number: 6 }])
    expect(staleEpisodeIds(stored, listed)).toEqual([1])
  })

  test('does nothing when the scrape returned no episodes', () => {
    const stored = [{ id: 1, slug: 'otakudesu:stale', number: 45, title: 'Episode 45' }]
    expect(staleEpisodeIds(stored, [])).toEqual([])
  })
})

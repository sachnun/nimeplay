import { describe, expect, test } from 'bun:test'
import { orderCandidates } from './candidates'
import type { SourceScores } from './scores'

function scores(map: Record<string, number>): SourceScores {
  return {
    scoreOf: (server: string) => map[server] ?? 0,
    size: Object.keys(map).length,
  }
}

const mirrors = [
  { quality: '480p', sources: [{ name: 'mega', dataContent: '480-mega' }] },
  {
    quality: '720p',
    sources: [
      { name: 'mega', dataContent: '720-mega' },
      { name: 'animeverse', dataContent: '720-animeverse' },
    ],
  },
  { quality: '1080p', sources: [{ name: 'mega', dataContent: '1080-mega' }] },
]

const candidates = mirrors.flatMap(mirror =>
  mirror.sources.map(source => ({ dataContent: source.dataContent, quality: mirror.quality, name: source.name })),
)

describe('orderCandidates', () => {
  test('promotes the highest scoring default to the front', () => {
    const ordered = orderCandidates(candidates, mirrors, '', '', scores({ animeverse: 0.9 }))
    expect(ordered[0]?.dataContent).toBe('720-animeverse')
    expect(ordered).toHaveLength(candidates.length)
  })

  test('promotes a different default when the scores change', () => {
    const ordered = orderCandidates(candidates, mirrors, '', '', scores({ mega: 0.9 }))
    expect(ordered[0]?.dataContent).toBe('720-mega')
  })

  test('keeps every candidate exactly once', () => {
    const ordered = orderCandidates(candidates, mirrors, '', '', scores({ animeverse: 0.9 }))
    expect([...ordered].map(c => c.dataContent).toSorted()).toEqual(
      candidates.map(c => c.dataContent).toSorted(),
    )
  })

  test('honours a matching server and quality preference', () => {
    const ordered = orderCandidates(candidates, mirrors, 'mega', '1080p')
    expect(ordered).toEqual([{ dataContent: '1080-mega', quality: '1080p', name: 'mega' }])
  })

  test('matches the server case insensitively', () => {
    const ordered = orderCandidates(candidates, mirrors, 'animeverse', '')
    expect(ordered[0]?.dataContent).toBe('720-animeverse')
  })

  test('falls back to the default when the preference matches nothing', () => {
    const ordered = orderCandidates(candidates, mirrors, 'nope', '144p', scores({ animeverse: 0.9 }))
    expect(ordered[0]?.dataContent).toBe('720-animeverse')
  })

  test('returns the original list when no default can be selected', () => {
    const ordered = orderCandidates(candidates, [], '', '')
    expect(ordered).toEqual(candidates)
  })
})

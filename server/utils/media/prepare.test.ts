import { describe, expect, test } from 'bun:test'
import { selectDefaultCandidate } from './prepare'

describe('selectDefaultCandidate', () => {
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

  test('starts at 720p and prefers the highest priority source', () => {
    expect(selectDefaultCandidate(mirrors)).toEqual({
      dataContent: '720-animeverse',
      quality: '720p',
      name: 'animeverse',
    })
  })

  test('falls back to the best available quality without 720p', () => {
    const noHd = [
      { quality: '480p', sources: [{ name: 'mega', dataContent: '480-mega' }] },
      { quality: '1080p', sources: [{ name: 'mega', dataContent: '1080-mega' }] },
    ]
    expect(selectDefaultCandidate(noHd)?.quality).toBe('1080p')
  })

  test('returns null when there are no mirrors', () => {
    expect(selectDefaultCandidate([])).toBeNull()
  })

  test('skips quality groups without sources', () => {
    const sparse = [
      { quality: '720p', sources: [] },
      { quality: '480p', sources: [{ name: 'mega', dataContent: '480-mega' }] },
    ]
    expect(selectDefaultCandidate(sparse)?.quality).toBe('480p')
  })
})

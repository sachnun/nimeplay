import { describe, expect, test } from 'bun:test'
import { qualityBitrate, qualityRank } from './mirror'

describe('qualityRank', () => {
  test('orders known qualities', () => {
    expect(qualityRank('1080p')).toBe(0)
    expect(qualityRank('720p')).toBe(1)
    expect(qualityRank('480p')).toBe(2)
    expect(qualityRank('360p')).toBe(3)
  })

  test('returns 99 for unknown qualities', () => {
    expect(qualityRank('144p')).toBe(99)
    expect(qualityRank('4k')).toBe(99)
    expect(qualityRank('')).toBe(99)
  })
})

describe('qualityBitrate', () => {
  test('maps known qualities to fixed bitrates', () => {
    expect(qualityBitrate('1080p')).toBe(5_000_000)
    expect(qualityBitrate('720p')).toBe(2_800_000)
    expect(qualityBitrate('480p')).toBe(1_400_000)
    expect(qualityBitrate('360p')).toBe(700_000)
  })

  test('derives a bitrate from unknown resolutions', () => {
    expect(qualityBitrate('999p')).toBe(999 * 4000)
  })

  test('falls back to a default for unparsable qualities', () => {
    expect(qualityBitrate('auto')).toBe(2_800_000)
  })
})

import { describe, expect, test } from 'bun:test'
import type { EpisodeData, EpisodeSource } from '~/types'
import {
  bufferedEndAt,
  buildFallbackOrder,
  findDefaultMirror,
  formatTime,
  hasFiniteDuration,
  listQualityLevels,
  qualityBitrate,
} from './player'

function source(server: string, quality: string): EpisodeSource {
  return { server, quality }
}

const sources: EpisodeSource[] = [
  source('mega', '480p'),
  source('mega', '1080p'),
  source('animeverse', '1080p'),
  source('mega', '720p'),
]

function video(currentTime: number, ranges: [number, number][]): HTMLVideoElement {
  return {
    currentTime,
    buffered: {
      length: ranges.length,
      start: (index: number) => ranges[index]![0],
      end: (index: number) => ranges[index]![1],
    },
  } as unknown as HTMLVideoElement
}

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

describe('hasFiniteDuration', () => {
  test('accepts positive finite durations', () => {
    expect(hasFiniteDuration({ duration: 100 } as HTMLVideoElement)).toBe(true)
  })

  test('rejects missing, zero and non finite durations', () => {
    expect(hasFiniteDuration(null)).toBe(false)
    expect(hasFiniteDuration(undefined)).toBe(false)
    expect(hasFiniteDuration({ duration: 0 } as HTMLVideoElement)).toBe(false)
    expect(hasFiniteDuration({ duration: Number.NaN } as HTMLVideoElement)).toBe(false)
    expect(hasFiniteDuration({ duration: Number.POSITIVE_INFINITY } as HTMLVideoElement)).toBe(false)
  })
})

describe('formatTime', () => {
  test('formats minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(599)).toBe('9:59')
  })

  test('formats hours with a padded minute segment', () => {
    expect(formatTime(3600)).toBe('1:00:00')
    expect(formatTime(3661)).toBe('1:01:01')
  })

  test('clamps invalid input', () => {
    expect(formatTime(-1)).toBe('0:00')
    expect(formatTime(Number.NaN)).toBe('0:00')
  })
})

describe('buildFallbackOrder', () => {
  test('starts at the requested quality then rotates through the rest', () => {
    expect(buildFallbackOrder(sources, '720p')).toEqual([
      { server: 'mega', quality: '720p' },
      { server: 'mega', quality: '480p' },
      { server: 'animeverse', quality: '1080p' },
      { server: 'mega', quality: '1080p' },
    ])
  })

  test('deduplicates server and quality pairs', () => {
    const duplicated = [...sources, source('mega', '1080p')]
    const order = buildFallbackOrder(duplicated, '1080p')
    expect(order).toHaveLength(4)
    expect(new Set(order.map(candidate => `${candidate.server}:${candidate.quality}`)).size).toBe(4)
  })

  test('excludes the provided candidate', () => {
    const order = buildFallbackOrder(sources, '1080p', { server: 'mega', quality: '1080p' })
    expect(order).not.toContainEqual({ server: 'mega', quality: '1080p' })
  })

  test('returns an empty list for no sources', () => {
    expect(buildFallbackOrder([], '720p')).toEqual([])
  })
})

describe('listQualityLevels', () => {
  test('returns one candidate per quality ordered best first', () => {
    expect(listQualityLevels(sources)).toEqual([
      { server: 'animeverse', quality: '1080p' },
      { server: 'mega', quality: '720p' },
      { server: 'mega', quality: '480p' },
    ])
  })
})

describe('findDefaultMirror', () => {
  test('prefers 720p then falls back', () => {
    const episode = { sources } as unknown as EpisodeData
    expect(findDefaultMirror(episode)).toEqual({ server: 'mega', quality: '720p' })
  })

  test('returns null when there are no sources', () => {
    expect(findDefaultMirror({ sources: [] } as unknown as EpisodeData)).toBeNull()
  })
})

describe('bufferedEndAt', () => {
  test('returns the end of the buffered range covering the playhead', () => {
    expect(bufferedEndAt(video(5, [[0, 10], [20, 30]]))).toBe(10)
    expect(bufferedEndAt(video(25, [[0, 10], [20, 30]]))).toBe(30)
  })

  test('never returns less than the current time', () => {
    expect(bufferedEndAt(video(5, []))).toBe(5)
    expect(bufferedEndAt(video(50, [[0, 10]]))).toBe(50)
  })
})

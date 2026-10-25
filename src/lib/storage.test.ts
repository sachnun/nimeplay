import { describe, expect, test } from 'bun:test'
import {
  clearAllProgress,
  episodeOpacity,
  getAutoSkip,
  getContinueWatching,
  getEpisodeProgressMap,
  getEpisodeStatus,
  getProgress,
  markWatched,
  progressKey,
  removeAnimeProgress,
  saveProgress,
  setAutoSkip,
  statusFromRatio,
} from './storage'

describe('progressKey', () => {
  test('joins the anime and episode numbers', () => {
    expect(progressKey(21, 3)).toBe('21:3')
  })
})

describe('statusFromRatio', () => {
  test('marks a completed episode at the threshold', () => {
    expect(statusFromRatio(0.87)).toBe('completed')
    expect(statusFromRatio(1)).toBe('completed')
  })

  test('marks partial progress as in progress', () => {
    expect(statusFromRatio(0.86)).toBe('in_progress')
    expect(statusFromRatio(0.01)).toBe('in_progress')
  })

  test('marks a zero ratio as unstarted', () => {
    expect(statusFromRatio(0)).toBe('unstarted')
  })
})

describe('episodeOpacity', () => {
  test('leaves unwatched episodes fully opaque', () => {
    expect(episodeOpacity(0)).toBe(1)
    expect(episodeOpacity(-1)).toBe(1)
  })

  test('fades episodes as progress grows', () => {
    expect(episodeOpacity(0.5)).toBe(0.75)
    expect(episodeOpacity(1)).toBe(0.5)
  })

  test('never fades below half opacity', () => {
    expect(episodeOpacity(2)).toBe(0.5)
  })
})

describe('outside the browser', () => {
  test('reads empty progress and prefs', async () => {
    expect(await getProgress('21:3')).toBeNull()
    expect(await getEpisodeStatus('21:3')).toBe('unstarted')
    expect(await getEpisodeProgressMap(21)).toEqual({})
    expect(await getContinueWatching()).toEqual([])
    expect(await getAutoSkip()).toBe(false)
  })

  test('accepts writes without touching storage', async () => {
    await expect(
      saveProgress('21:3', { malId: 21, episodeNumber: 3, currentTime: 10, duration: 100 }),
    ).resolves.toBeUndefined()
    await expect(
      markWatched('21:3', { malId: 21, episodeNumber: 3, currentTime: 10, duration: 100 }),
    ).resolves.toBeUndefined()
    await expect(setAutoSkip(true)).resolves.toBeUndefined()
    await expect(removeAnimeProgress(21)).resolves.toBeUndefined()
    await expect(clearAllProgress()).resolves.toBeUndefined()
  })
})

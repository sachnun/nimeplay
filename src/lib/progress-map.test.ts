import { describe, expect, test } from 'bun:test'
import { progressMap, syncProgressMap } from './progress-map'

const fallback = [
  { malId: 1, episodeNumber: 2, currentTime: 30, duration: 100 },
  { malId: 7, episodeNumber: 1, currentTime: 5, duration: 200, latestEpisode: 12 },
]

describe('syncProgressMap', () => {
  test('fills the map from the fallback when storage is empty', async () => {
    await syncProgressMap(fallback)
    expect(progressMap.size).toBe(2)
    expect(progressMap.get(1)).toEqual(fallback[0])
    expect(progressMap.get(7)?.latestEpisode).toBe(12)
  })

  test('clears stale entries on the next sync', async () => {
    await syncProgressMap([fallback[0]])
    expect(progressMap.has(7)).toBe(false)
    expect(progressMap.size).toBe(1)
  })

  test('empties the map without fallback data', async () => {
    await syncProgressMap()
    expect(progressMap.size).toBe(0)
  })
})

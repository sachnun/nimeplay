import type { SkipTime } from '#lib/types'

interface SkipTimesResponse {
  found: boolean
  results: SkipTime[]
}

const SKIP_TIMES_TIMEOUT_MS = 6000

export async function fetchSkipTimes(malId: number, episode: number, episodeLength: number): Promise<SkipTime[]> {
  try {
    const response = await fetch('/api/v1/skip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ malId, episode, episodeLength: Math.floor(episodeLength) }),
      signal: AbortSignal.timeout(SKIP_TIMES_TIMEOUT_MS),
    })
    if (!response.ok) return []
    const data: SkipTimesResponse = await response.json()
    return data.found ? data.results : []
  } catch {
    return []
  }
}

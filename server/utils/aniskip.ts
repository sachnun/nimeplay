import { searchAnime } from './jikan'

export interface SkipInterval {
  startTime: number
  endTime: number
}

export interface SkipTime {
  interval: SkipInterval
  skipType: 'op' | 'ed' | 'mixed-op' | 'mixed-ed' | 'recap'
  skipId: string
  episodeLength: number
}

interface AniskipResponse {
  found: boolean
  results: SkipTime[]
}

function cleanAnimeTitle(title: string): string {
  return title
    .replace(/\s*Subtitle\s+Indonesia\s*$/i, '')
    .replace(/\s*Sub\s+Indo(nesia)?\s*$/i, '')
    .replace(/\s*Episode\s+\d+.*$/i, '')
    .replace(/\s*\(?(Season|S)\s*\d+\)?/gi, '')
    .replace(/\s*\(?Musim\s+\d+\)?/gi, '')
    .replace(/\s*\(?\d{4}\)?$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function fetchMalId(animeTitle: string): Promise<number | null> {
  const cleaned = cleanAnimeTitle(animeTitle)
  if (!cleaned) return null
  try {
    return await searchAnime(cleaned)
  } catch {
    return null
  }
}

export function extractEpisodeNumber(slug: string): number | null {
  const match = slug.match(/episode-(\d+)/i)
  return match?.[1] ? Number.parseInt(match[1]) : null
}

export async function fetchSkipTimes(malId: number, episode: number, episodeLength: number): Promise<SkipTime[]> {
  try {
    const params = new URLSearchParams()
    params.append('types', 'op')
    params.append('types', 'ed')
    params.append('types', 'mixed-op')
    params.append('types', 'mixed-ed')
    params.append('types', 'recap')
    params.append('episodeLength', Math.floor(episodeLength).toString())
    const res = await fetch(`https://api.aniskip.com/v2/skip-times/${malId}/${episode}?${params.toString()}`)
    if (!res.ok) return []
    const data: AniskipResponse = await res.json()
    return data.found ? data.results : []
  } catch {
    return []
  }
}

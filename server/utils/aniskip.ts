import { cached } from './cache'
import { timeoutSignal } from './fetch'
import { searchAnime } from './jikan'
import { cleanTitleWithRules, type TitleCleanupRule } from './title'

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

const MAL_ID_TTL = 12 * 60 * 60 * 1000
const SKIP_TIMES_TTL = 24 * 60 * 60 * 1000
const ANISKIP_TIMEOUT_MS = 6000
const ANIME_TITLE_CLEANUP: TitleCleanupRule[] = [
  /\s*Subtitle\s+Indonesia\s*$/i,
  /\s*Sub\s+Indo(nesia)?\s*$/i,
  /\s*Episode\s+\d+.*$/i,
  /\s*\(?(Season|S)\s*\d+\)?/gi,
  /\s*\(?Musim\s+\d+\)?/gi,
  /\s*\(?\d{4}\)?$/g,
  [/\s+/g, ' '],
]

function cleanAnimeTitle(title: string): string {
  return cleanTitleWithRules(title, ANIME_TITLE_CLEANUP)
}

export async function fetchMalId(animeTitle: string): Promise<number | null> {
  const cleaned = cleanAnimeTitle(animeTitle)
  if (!cleaned) return null
  return cached(`aniskip:mal-id:${cleaned.toLowerCase()}`, MAL_ID_TTL, async () => {
    try {
      return await searchAnime(cleaned)
    } catch {
      return null
    }
  })
}

export function extractEpisodeNumber(slug: string): number | null {
  const match = slug.match(/episode-(\d+)/i)
  return match?.[1] ? Number.parseInt(match[1]) : null
}

export async function fetchSkipTimes(malId: number, episode: number, episodeLength: number): Promise<SkipTime[]> {
  const length = Math.floor(episodeLength)
  return cached(`aniskip:skip-times:${malId}:${episode}:${length}`, SKIP_TIMES_TTL, async () => {
    try {
      const params = new URLSearchParams()
      params.append('types', 'op')
      params.append('types', 'ed')
      params.append('types', 'mixed-op')
      params.append('types', 'mixed-ed')
      params.append('types', 'recap')
      params.append('episodeLength', length.toString())
      const res = await fetch(`https://api.aniskip.com/v2/skip-times/${malId}/${episode}?${params.toString()}`, { signal: timeoutSignal(ANISKIP_TIMEOUT_MS) })
      if (!res.ok) return []
      const data: AniskipResponse = await res.json()
      return data.found ? data.results : []
    } catch {
      return []
    }
  })
}

import { searchAnime } from '~/utils/jikan'
import type { SkipTime } from '~/utils/types'

type TitleCleanupRule = RegExp | [RegExp, string]

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
  return ANIME_TITLE_CLEANUP.reduce((value, rule) => {
    if (Array.isArray(rule)) return value.replace(rule[0], rule[1])
    return value.replace(rule, '')
  }, title).trim()
}

interface AniskipResponse {
  found: boolean
  results: SkipTime[]
}

const ANISKIP_TIMEOUT_MS = 6000

async function fetchAniskipSkipTimes(malId: number, episode: number, episodeLength: number): Promise<SkipTime[]> {
  const length = Math.floor(episodeLength)
  const params = new URLSearchParams()
  params.append('types', 'op')
  params.append('types', 'ed')
  params.append('types', 'mixed-op')
  params.append('types', 'mixed-ed')
  params.append('types', 'recap')
  params.append('episodeLength', length.toString())
  const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?${params.toString()}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ANISKIP_TIMEOUT_MS) })
    if (!res.ok) return []
    const data: AniskipResponse = await res.json()
    return data.found ? data.results : []
  } catch {
    return []
  }
}

export async function fetchMalId(animeTitle: string): Promise<number | null> {
  const cleaned = cleanAnimeTitle(animeTitle)
  if (!cleaned) return null
  return searchAnime(cleaned)
}

export async function fetchSkipTimes(malId: number, episode: number, episodeLength: number): Promise<SkipTime[]> {
  return fetchAniskipSkipTimes(malId, episode, episodeLength)
}

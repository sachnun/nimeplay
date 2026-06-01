import { Effect, pipe } from 'effect'
import { cache } from './cache'
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

function fetchAniskipEffect(url: string): Effect.Effect<AniskipResponse | null> {
  return pipe(
    Effect.tryPromise({
      try: () => fetch(url, { signal: AbortSignal.timeout(ANISKIP_TIMEOUT_MS) }),
      catch: () => null,
    }),
    Effect.flatMap((res) =>
      res.ok
        ? Effect.tryPromise({ try: () => res.json() as Promise<AniskipResponse>, catch: () => null })
        : Effect.succeed(null),
    ),
    Effect.retry({ times: 2 }),
    Effect.catchAll(() => Effect.succeed(null)),
  )
}

export async function fetchMalId(animeTitle: string): Promise<number | null> {
  const cleaned = cleanAnimeTitle(animeTitle)
  if (!cleaned) return null
  return cache.aniskip.malId(cleaned.toLowerCase(), MAL_ID_TTL, () =>
    Effect.runPromise(
      pipe(
        Effect.tryPromise({ try: () => searchAnime(cleaned), catch: () => null }),
        Effect.retry({ times: 1 }),
        Effect.catchAll(() => Effect.succeed(null)),
      ),
    ),
  ) as Promise<number | null>
}

export function fetchSkipTimes(malId: number, episode: number, episodeLength: number): Promise<SkipTime[]> {
  const length = Math.floor(episodeLength)
  const params = new URLSearchParams()
  params.append('types', 'op')
  params.append('types', 'ed')
  params.append('types', 'mixed-op')
  params.append('types', 'mixed-ed')
  params.append('types', 'recap')
  params.append('episodeLength', length.toString())
  const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?${params.toString()}`
  const key = `${malId}:${episode}:${length}`

  return cache.aniskip.skipTimes(key, SKIP_TIMES_TTL, () =>
    Effect.runPromise(
      pipe(
        fetchAniskipEffect(url),
        Effect.map((data) => (data?.found ? data.results : [])),
      ),
    ),
  ) as Promise<SkipTime[]>
}
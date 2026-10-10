import { error, json } from '@sveltejs/kit'
import { plainGet } from '#lib/server/utils/net/fetch'
import type { RequestHandler } from './$types'

const ANISKIP_TIMEOUT_MS = 6000
const SKIP_TYPES = ['op', 'ed', 'mixed-op', 'mixed-ed', 'recap'] as const

interface SkipInterval {
  startTime: number
  endTime: number
}

interface SkipTime {
  interval: SkipInterval
  skipType: 'op' | 'ed' | 'mixed-op' | 'mixed-ed' | 'recap'
  skipId: string
  episodeLength: number
}

interface SkipTimesBody {
  malId?: number
  episode?: number
  episodeLength?: number
}

interface AniskipResponse {
  found?: boolean
  results?: SkipTime[]
}

async function requestSkipTimes(malId: number, episode: number, episodeLength: number): Promise<SkipTime[]> {
  const params = new URLSearchParams()
  for (const type of SKIP_TYPES) params.append('types', type)
  params.append('episodeLength', String(Math.floor(episodeLength)))
  const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?${params.toString()}`
  const response = await plainGet(url, { timeoutMs: ANISKIP_TIMEOUT_MS })
  if (response?.status !== 200) return []
  try {
    const data = JSON.parse(response.text) as AniskipResponse
    return data.found && Array.isArray(data.results) ? data.results : []
  } catch {
    return []
  }
}

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as SkipTimesBody | null
  const malId = Number(body?.malId)
  const episode = Number(body?.episode)
  const episodeLength = Number(body?.episodeLength)
  if (
    !Number.isInteger(malId) ||
    malId <= 0 ||
    !Number.isInteger(episode) ||
    episode <= 0 ||
    !Number.isFinite(episodeLength) ||
    episodeLength <= 0
  ) {
    error(400, 'Invalid malId, episode or episodeLength')
  }

  const results = await requestSkipTimes(malId, episode, episodeLength)
  return json({ found: results.length > 0, results })
}

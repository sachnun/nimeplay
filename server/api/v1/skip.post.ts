import { defineRouteMeta } from 'nitro'
import { createError, defineEventHandler, readBody } from 'nuxt/server'

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

defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'Episode skip times',
    description:
      'Resolve opening, ending and recap skip times for an episode through AniSkip. Returns an empty list with found=false when no skip times exist, never a 404.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['malId', 'episode', 'episodeLength'],
            properties: {
              malId: { type: 'integer', example: 52991, description: 'MyAnimeList ID' },
              episode: { type: 'integer', minimum: 1, example: 1, description: 'Episode number' },
              episodeLength: {
                type: 'number',
                example: 1440,
                description: 'Episode duration in seconds, measured by the player',
              },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Skip times, empty when none are found',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['found', 'results'],
              properties: {
                found: { type: 'boolean', example: true },
                results: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['interval', 'skipType', 'skipId', 'episodeLength'],
                    properties: {
                      interval: {
                        type: 'object',
                        required: ['startTime', 'endTime'],
                        properties: {
                          startTime: { type: 'number', example: 310.571 },
                          endTime: { type: 'number', example: 400.571 },
                        },
                      },
                      skipType: {
                        type: 'string',
                        enum: ['op', 'ed', 'mixed-op', 'mixed-ed', 'recap'],
                        example: 'op',
                      },
                      skipId: { type: 'string', example: 'd4f34b6d-0547-4438-ac93-b25b577eddd5' },
                      episodeLength: { type: 'number', example: 1443.984 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Invalid malId, episode or episodeLength' },
    },
  },
})

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

export default defineEventHandler(async event => {
  const body = await readBody<SkipTimesBody>(event).catch(() => null)
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
    throw createError({ status: 400, statusText: 'Invalid malId, episode or episodeLength' })
  }

  const results = await requestSkipTimes(malId, episode, episodeLength)
  return { found: results.length > 0, results }
})

import { createError, getRouterParam } from 'h3'
import { getAnimeDetail } from '../../utils/queries'
import { scheduleAnimeRefresh } from '../../utils/refresh'

defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'Get anime details',
    description: 'Anime details including episodes, keyed by MyAnimeList ID. Sourced from the database.',
    parameters: [
      {
        name: 'malId',
        in: 'path',
        required: true,
        schema: { type: 'integer' },
        description: 'MyAnimeList ID',
      },
    ],
    responses: {
      '200': { description: 'Anime details including episodes' },
      '404': { description: 'Anime not found or metadata not yet synced' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const malId = Number(getRouterParam(event, 'malId'))
  if (!Number.isInteger(malId) || malId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid MAL id' })
  }

  const detail = await getAnimeDetail(malId)
  if (!detail) throw createError({ statusCode: 404, statusMessage: 'Anime not found' })
  scheduleAnimeRefresh(event, malId)
  return detail
})

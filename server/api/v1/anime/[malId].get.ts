import { createError, getRouterParam } from 'h3'
import { getAnimeDetail } from '../../../utils/queries'
import { toAbsoluteUrl } from '../../../utils/r2'
import { scheduleAnimeRefresh } from '../../../utils/refresh'

defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'Get anime detail',
    description: 'Anime detail with episode list, keyed by MyAnimeList ID.',
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
      '200': { description: 'Anime detail' },
      '404': { description: 'Anime not found' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const malId = Number(getRouterParam(event, 'malId'))
  if (!Number.isInteger(malId) || malId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid MAL id' })
  }

  const detail = await getAnimeDetail(malId, event)
  if (!detail) throw createError({ statusCode: 404, statusMessage: 'Anime not found' })
  setHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')
  scheduleAnimeRefresh(event, malId)
  return { ...detail, thumbnail: toAbsoluteUrl(detail.thumbnail, event) }
})

import type { H3Event } from 'h3'
import { createError, getRouterParam } from 'h3'
import { getAnimeDetail } from '../../../utils/queries'
import { toAbsoluteUrl } from '../../../utils/media'
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

  const detail = await getAnimeDetail(malId)
  if (!detail) throw createError({ statusCode: 404, statusMessage: 'Anime not found' })
  setHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')
  const waitUntil = (event as H3Event & { waitUntil?: (p: Promise<unknown>) => void }).waitUntil
  const refresh = scheduleAnimeRefresh(malId)
  if (waitUntil) waitUntil(refresh)
  return { ...detail, thumbnail: toAbsoluteUrl(detail.thumbnail, getRequestURL(event).origin) }
})

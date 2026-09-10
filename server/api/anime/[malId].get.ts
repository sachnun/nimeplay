import { createError, getRouterParam } from 'h3'
import { getAnimeDetail } from '../../utils/queries'

export default defineEventHandler(async (event) => {
  const malId = Number(getRouterParam(event, 'malId'))
  if (!Number.isInteger(malId) || malId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid MAL id' })
  }

  const detail = await getAnimeDetail(malId)
  if (!detail) throw createError({ statusCode: 404, statusMessage: 'Anime not found' })
  setHeader(event, 'Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300')
  return detail
})

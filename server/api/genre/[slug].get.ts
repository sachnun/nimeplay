import { createError, getQuery, getRouterParam } from 'h3'
import { getGenreAnimePage } from '../../utils/queries'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') || ''
  const page = Math.max(1, Number(getQuery(event).page) || 1)

  const result = await getGenreAnimePage(slug, page)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Genre not found' })
  setHeader(event, 'Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  return result
})

import { scrapeGenre } from '../../utils/scraper'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing genre slug' })
  const query = getQuery(event)
  const page = Number.parseInt(String(query.page || '1')) || 1
  return scrapeGenre(slug, page)
})

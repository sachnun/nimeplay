import { scrapeAnimeDetail } from '../../utils/scraper'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing anime slug' })
  return scrapeAnimeDetail(slug)
})

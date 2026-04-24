import { scrapeEpisode } from '../../utils/scraper'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing episode slug' })
  return scrapeEpisode(slug)
})

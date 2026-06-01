import { scrapeAnimeDetail } from '../../utils/scraper'
import { setApiCorsHeaders } from '../../utils/cors'

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  const slug = getRouterParam(event, 'slug') || ''
  return scrapeAnimeDetail(slug)
})

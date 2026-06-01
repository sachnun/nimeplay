import { scrapeSearch } from '../utils/scraper'
import { setApiCorsHeaders } from '../utils/cors'

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  const query = String(getQuery(event).query || '').trim()
  if (!query) return []
  return scrapeSearch(query)
})

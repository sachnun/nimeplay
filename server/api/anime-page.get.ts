import { scrapeOngoing, scrapeCompleted } from '../utils/scraper'
import { setApiCorsHeaders } from '../utils/cors'

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  const query = getQuery(event)
  const type = String(query.type || 'ONGOING')
  const page = Math.max(1, Number(query.page) || 1)

  if (type === 'COMPLETED') return scrapeCompleted(page)
  return scrapeOngoing(page)
})

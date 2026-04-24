import { scrapeOngoing } from '../utils/scraper'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Number.parseInt(String(query.page || '1')) || 1
  return scrapeOngoing(page)
})

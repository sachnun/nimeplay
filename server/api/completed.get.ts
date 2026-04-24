import { scrapeCompleted } from '../utils/scraper'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Number.parseInt(String(query.page || '1')) || 1
  return scrapeCompleted(page)
})

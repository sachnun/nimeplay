import { scrapeSearch } from '../utils/scraper'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = String(query.q || '').trim()
  if (!q) return []
  return scrapeSearch(q)
})

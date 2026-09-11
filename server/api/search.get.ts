import { searchAnime } from '../utils/queries'

export default defineEventHandler(async (event) => {
  const query = String(getQuery(event).query || '').trim()
  if (!query) return []
  setHeader(event, 'Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=300')
  return searchAnime(query)
})

import { searchAnime } from '../utils/queries'

export default defineEventHandler(async (event) => {
  const query = String(getQuery(event).query || '').trim().slice(0, 80)
  if (query.length < 2) return []
  setHeader(event, 'Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
  return searchAnime(query)
})

import { searchAnime } from '../utils/queries'

export default defineEventHandler(async (event) => {
  const query = String(getQuery(event).query || '').trim()
  if (!query) return []
  return searchAnime(query)
})

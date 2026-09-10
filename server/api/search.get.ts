import { searchAnime } from '../utils/queries'

defineRouteMeta({
  openAPI: false,
})

export default defineEventHandler(async (event) => {
  const query = String(getQuery(event).query || '').trim()
  if (!query) return []
  return searchAnime(query)
})

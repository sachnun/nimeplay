import { fetchJikanData } from '../utils/jikan'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const title = String(query.title || '').trim()
  const japaneseTitle = query.japaneseTitle ? String(query.japaneseTitle) : undefined
  const cachedMalId = query.cachedMalId ? Number.parseInt(String(query.cachedMalId)) : null
  if (!title) return null
  return fetchJikanData(title, japaneseTitle, cachedMalId || null)
})

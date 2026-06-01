

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  const query = getQuery(event)
  const title = String(query.title || '').trim()
  if (!title) return null
  const japaneseTitle = query.japaneseTitle ? String(query.japaneseTitle) : undefined
  const cachedMalId = query.cachedMalId ? Number(query.cachedMalId) || null : null
  return fetchJikanData(title, japaneseTitle, cachedMalId)
})

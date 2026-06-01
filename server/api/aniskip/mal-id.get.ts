

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  const title = String(getQuery(event).title || '').trim()
  return { malId: title ? await fetchMalId(title) : null }
})

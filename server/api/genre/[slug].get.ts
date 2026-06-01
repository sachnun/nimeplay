

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  const slug = getRouterParam(event, 'slug') || ''
  const page = Math.max(1, Number(getQuery(event).page) || 1)
  return scrapeGenre(slug, page)
})

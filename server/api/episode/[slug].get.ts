

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  const slug = getRouterParam(event, 'slug') || ''
  return scrapeEpisode(slug)
})

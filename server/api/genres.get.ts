

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  return scrapeGenreList()
})

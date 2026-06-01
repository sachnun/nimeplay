import { scrapeGenreList } from '../utils/scraper'
import { setApiCorsHeaders } from '../utils/cors'

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  return scrapeGenreList()
})

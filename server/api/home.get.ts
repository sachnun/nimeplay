import { scrapeOngoing, scrapeCompleted, scrapeGenreList } from '../utils/scraper'
import { apiCorsPreflightResponse, setApiCorsHeaders } from '../utils/cors'

export default defineEventHandler(async (event) => {
  if (event.method === 'OPTIONS') return apiCorsPreflightResponse()
  setApiCorsHeaders(event)

  const [ongoingData, completedData, genres] = await Promise.all([
    scrapeOngoing(1).catch(() => ({ anime: [], totalPages: 1 })),
    scrapeCompleted(1).catch(() => ({ anime: [], totalPages: 1 })),
    scrapeGenreList().catch(() => []),
  ])

  return { ongoingData, completedData, genres }
})

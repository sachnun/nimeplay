import { scrapeCompleted, scrapeGenreList, scrapeOngoing } from '../utils/scraper'

export default defineEventHandler(async () => {
  const [ongoingData, completedData, genres] = await Promise.all([
    scrapeOngoing(1),
    scrapeCompleted(1),
    scrapeGenreList(),
  ])

  return { ongoingData, completedData, genres }
})

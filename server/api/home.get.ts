import { getGenreList, listAnimePage } from '../utils/queries'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')
  return Promise.all([
    listAnimePage('ONGOING', 1, event),
    listAnimePage('COMPLETED', 1, event),
    getGenreList(event),
  ]).then(([ongoingData, completedData, genres]) => ({ ongoingData, completedData, genres }))
})

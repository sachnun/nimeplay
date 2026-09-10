import { getGenreList, listAnimePage } from '../utils/queries'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300')
  return Promise.all([
    listAnimePage('ONGOING', 1),
    listAnimePage('COMPLETED', 1),
    getGenreList(),
  ]).then(([ongoingData, completedData, genres]) => ({ ongoingData, completedData, genres }))
})

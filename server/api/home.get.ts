import { listAnimePage } from '../utils/db/queries/catalog'
import { getGenreList } from '../utils/db/queries/genres'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')
  return Promise.all([
    listAnimePage('ONGOING', 1),
    listAnimePage('COMPLETED', 1),
    getGenreList(),
  ]).then(([ongoingData, completedData, genres]) => ({ ongoingData, completedData, genres }))
})

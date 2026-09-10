import { getGenreList, listAnimePage } from '../utils/queries'
import { scheduleCatalogSync } from '../utils/refresh'

export default defineEventHandler((event) => {
  scheduleCatalogSync(event)
  return Promise.all([
    listAnimePage('ONGOING', 1),
    listAnimePage('COMPLETED', 1),
    getGenreList(),
  ]).then(([ongoingData, completedData, genres]) => ({ ongoingData, completedData, genres }))
})

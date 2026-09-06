import { getGenreList, listAnimePage } from '../utils/queries'
import { scheduleCatalogSync } from '../utils/refresh'

defineRouteMeta({
  openAPI: {
    tags: ['Home'],
    summary: 'Get home page data',
    description: 'Returns the first page of ongoing anime, completed anime and the genre list from the database.',
    responses: {
      '200': { description: 'Home page payload' },
    },
  },
})

export default defineCachedEventHandler((event) => {
  scheduleCatalogSync(event)
  setHeader(event, 'Cache-Control', 'public, max-age=180, s-maxage=180, stale-while-revalidate=600')
  return Promise.all([
    listAnimePage('ONGOING', 1),
    listAnimePage('COMPLETED', 1),
    getGenreList(),
  ]).then(([ongoingData, completedData, genres]) => ({ ongoingData, completedData, genres }))
}, {
  maxAge: 180,
  staleMaxAge: 600,
  getKey: () => 'home:v1',
})

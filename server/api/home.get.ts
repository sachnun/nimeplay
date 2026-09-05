import { getGenreList, listAnimePage } from '../utils/queries'

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

export default defineEventHandler(() => {
  return Promise.all([
    listAnimePage('ONGOING', 1),
    listAnimePage('COMPLETED', 1),
    getGenreList(),
  ]).then(([ongoingData, completedData, genres]) => ({ ongoingData, completedData, genres }))
})

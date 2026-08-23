import { searchAnime } from '../utils/queries'

defineRouteMeta({
  openAPI: {
    tags: ['Search'],
    summary: 'Search anime',
    description: 'Searches anime by title in the database. Returns an empty array when the query is empty.',
    parameters: [
      {
        name: 'query',
        in: 'query',
        required: true,
        schema: { type: 'string' },
        description: 'Anime title to search for',
      },
    ],
    responses: {
      '200': { description: 'List of matching anime' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const query = String(getQuery(event).query || '').trim()
  if (!query) return []
  return searchAnime(query)
})

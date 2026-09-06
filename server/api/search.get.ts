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

export default defineCachedEventHandler(async (event) => {
  const query = String(getQuery(event).query || '').trim().slice(0, 60)
  if (query.length < 2) return []
  setHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300')
  return searchAnime(query)
}, {
  maxAge: 60,
  staleMaxAge: 300,
  getKey: (event) => `search:v1:${String(getQuery(event).query || '').trim().slice(0, 60).toLowerCase()}`,
})

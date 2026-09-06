import { getQuery } from 'h3'
import { listAnimePage } from '../utils/queries'
import { scheduleCatalogSync } from '../utils/refresh'

defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'List anime by type',
    description: 'Paginated list of ongoing or completed anime from the database.',
    parameters: [
      {
        name: 'type',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['ONGOING', 'COMPLETED'], default: 'ONGOING' },
      },
      {
        name: 'page',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, default: 1 },
      },
    ],
    responses: {
      '200': { description: 'Anime listing' },
    },
  },
})

const MAX_LIST_PAGE = 100

export default defineCachedEventHandler((event) => {
  const query = getQuery(event)
  const type = String(query.type || 'ONGOING')
  const page = Math.min(MAX_LIST_PAGE, Math.max(1, Number(query.page) || 1))

  if (type === 'ONGOING' && page === 1) scheduleCatalogSync(event)

  setHeader(event, 'Cache-Control', 'public, max-age=180, s-maxage=180, stale-while-revalidate=600')
  return type === 'COMPLETED' ? listAnimePage('COMPLETED', page) : listAnimePage('ONGOING', page)
}, {
  maxAge: 180,
  staleMaxAge: 600,
  getKey: (event) => {
    const query = getQuery(event)
    const type = String(query.type || 'ONGOING')
    const page = Math.min(MAX_LIST_PAGE, Math.max(1, Number(query.page) || 1))
    return `anime-page:v1:${type}:${page}`
  },
})

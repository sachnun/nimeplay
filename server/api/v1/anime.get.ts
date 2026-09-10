import { getQuery } from 'h3'
import { listAnimePage, searchAnime } from '../../utils/queries'
import { scheduleCatalogSync } from '../../utils/refresh'

defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'List anime',
    description: 'Paginated list of ongoing or completed anime. Set q to search by title.',
    parameters: [
      {
        name: 'type',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['ongoing', 'completed'], default: 'ongoing' },
        description: 'Catalog type',
      },
      {
        name: 'page',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, default: 1 },
        description: 'Page number',
      },
      {
        name: 'q',
        in: 'query',
        required: false,
        schema: { type: 'string' },
        description: 'Search anime by title',
      },
    ],
    responses: {
      '200': { description: 'Anime listing' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = String(query.q ?? '').trim()
  if (q) {
    const rows = await searchAnime(q)
    return { data: rows, page: 1, totalPages: 1 }
  }

  const rawType = String(query.type || 'ongoing').toUpperCase()
  const status = rawType === 'COMPLETED' ? 'COMPLETED' : 'ONGOING'
  const page = Math.max(1, Number(query.page) || 1)

  if (status === 'ONGOING' && page === 1) scheduleCatalogSync(event)

  const result = await listAnimePage(status, page)
  return { data: result.anime, page, totalPages: result.totalPages }
})

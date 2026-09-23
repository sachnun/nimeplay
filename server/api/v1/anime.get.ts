import { getQuery } from 'h3'
import { listAnimePage } from '../../utils/db/queries/catalog'
import { searchAnime } from '../../utils/db/queries/search'
import { toAbsoluteUrl } from '../../utils/media'

defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'List anime',
    description: 'Paginated list of ongoing or completed anime. Set q to search by title, alternate titles, studio, genre, character, or synopsis.',
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
        description: 'Search anime across titles, studio, genres, characters, and synopsis',
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
    setHeader(event, 'Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=300')
    const origin = getRequestURL(event).origin
    const rows = await searchAnime(q)
    return { data: rows.map(row => ({ ...row, thumbnail: toAbsoluteUrl(row.thumbnail, origin) })), page: 1, totalPages: 1 }
  }

  const rawType = String(query.type || 'ongoing').toUpperCase()
  const status = rawType === 'COMPLETED' ? 'COMPLETED' : 'ONGOING'
  const page = Math.max(1, Number(query.page) || 1)

  setHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')
  const result = await listAnimePage(status, page)
  return { data: result.anime.map(item => ({ ...item, thumbnail: toAbsoluteUrl(item.thumbnail, getRequestURL(event).origin) })), page, totalPages: result.totalPages }
})

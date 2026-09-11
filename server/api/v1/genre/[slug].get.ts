import { createError, getQuery, getRouterParam } from 'h3'
import { getGenreAnimePage } from '../../../utils/queries'
import { toAbsoluteUrl } from '../../../utils/r2'

defineRouteMeta({
  openAPI: {
    tags: ['Genre'],
    summary: 'List anime by genre',
    description: 'Paginated anime list for a genre.',
    parameters: [
      {
        name: 'slug',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Genre slug, see GET /api/v1/genres',
      },
      {
        name: 'page',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, default: 1 },
        description: 'Page number',
      },
    ],
    responses: {
      '200': { description: 'Anime listing for the genre' },
      '404': { description: 'Genre not found' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') || ''
  const page = Math.max(1, Number(getQuery(event).page) || 1)

  const result = await getGenreAnimePage(slug, page, event)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Genre not found' })
  return { data: result.anime.map(item => ({ ...item, thumbnail: toAbsoluteUrl(item.thumbnail, event) })), page, totalPages: result.totalPages }
})

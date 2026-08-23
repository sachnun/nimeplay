import { createError, getQuery, getRouterParam } from 'h3'
import { getGenreAnimePage } from '../../utils/queries'

defineRouteMeta({
  openAPI: {
    tags: ['Genre'],
    summary: 'List anime by genre',
    description: 'Paginated anime list for a genre, sourced from the database.',
    parameters: [
      {
        name: 'slug',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Slug of the genre',
      },
      {
        name: 'page',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, default: 1 },
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

  const result = await getGenreAnimePage(slug, page)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Genre not found' })
  return result
})

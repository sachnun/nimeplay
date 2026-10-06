import { defineRouteMeta } from 'nitro'
import { createError, defineEventHandler, getQuery, getRouterParam } from 'nuxt/server'

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
        example: 1,
      },
    ],
    responses: {
      '200': {
        description: 'Anime listing for the genre',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['data', 'page', 'totalPages'],
              properties: {
                data: { type: 'array', items: { $ref: '#/components/schemas/GenreAnimeCard' } },
                page: { type: 'integer', example: 1 },
                totalPages: { type: 'integer', example: 12 },
              },
            },
            example: {
              data: [
                {
                  malId: 52991,
                  title: 'Sousou no Frieren',
                  thumbnail: '/media/poster/52991.webp',
                  studio: '',
                  episodes: '28 Eps',
                  rating: '9.3',
                  genres: 'Adventure, Drama, Fantasy',
                  date: 'Fall 2023',
                },
              ],
              page: 1,
              totalPages: 12,
            },
          },
        },
      },
      '404': { description: 'Genre not found' },
    },
  },
})

export default defineEventHandler(async event => {
  const slug = getRouterParam(event, 'slug', { decode: true }) || ''
  const page = Math.max(1, Number(getQuery(event).page) || 1)

  const result = await getGenreAnimePage(slug, page)
  if (!result) throw createError({ status: 404, statusText: 'Genre not found' })
  return {
    data: result.anime,
    page,
    totalPages: result.totalPages,
  }
})

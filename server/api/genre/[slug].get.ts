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

const MAX_GENRE_PAGE = 100

export default defineCachedEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') || ''
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) throw createError({ statusCode: 404, statusMessage: 'Genre not found' })
  const page = Math.min(MAX_GENRE_PAGE, Math.max(1, Number(getQuery(event).page) || 1))

  const result = await getGenreAnimePage(slug, page)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Genre not found' })
  setHeader(event, 'Cache-Control', 'public, max-age=600, s-maxage=600, stale-while-revalidate=3600')
  return result
}, {
  maxAge: 600,
  staleMaxAge: 3600,
  getKey: (event) => {
    const slug = getRouterParam(event, 'slug') || ''
    const page = Math.min(MAX_GENRE_PAGE, Math.max(1, Number(getQuery(event).page) || 1))
    return `genre:v1:${slug}:${page}`
  },
})



defineRouteMeta({
  openAPI: {
    tags: ['Genre'],
    summary: 'List anime by genre',
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
    },
  },
})

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') || ''
  const page = Math.max(1, Number(getQuery(event).page) || 1)
  return scrapeGenre(slug, page)
})

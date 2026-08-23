

defineRouteMeta({
  openAPI: {
    tags: ['Episode'],
    summary: 'Get episode details',
    parameters: [
      {
        name: 'slug',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Slug of the episode',
      },
    ],
    responses: {
      '200': { description: 'Episode details including player sources' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') || ''
  return scrapeEpisode(slug)
})

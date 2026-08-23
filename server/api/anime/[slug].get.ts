

defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'Get anime details',
    parameters: [
      {
        name: 'slug',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Slug of the anime',
      },
    ],
    responses: {
      '200': { description: 'Anime details including episodes' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') || ''
  return scrapeAnimeDetail(slug)
})

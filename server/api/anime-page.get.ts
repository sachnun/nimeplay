

defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'List anime by type',
    description: 'Paginated list of ongoing or completed anime.',
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

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const type = String(query.type || 'ONGOING')
  const page = Math.max(1, Number(query.page) || 1)

  if (type === 'COMPLETED') return scrapeCompleted(page)
  return scrapeOngoing(page)
})

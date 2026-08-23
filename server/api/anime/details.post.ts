

defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'Get details for multiple anime',
    description: 'Fetches anime details for a list of slugs. Failed lookups return `anime: null`.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['slugs'],
            properties: {
              slugs: { type: 'array', items: { type: 'string' }, description: 'Anime slugs to fetch' },
            },
          },
        },
      },
    },
    responses: {
      '200': { description: 'List of anime details keyed by slug' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const body = await readBody<{ slugs: string[] }>(event)
  if (!body?.slugs?.length) return []

  const seen = new Set<string>()
  const unique = body.slugs.map((s) => s.trim()).filter((s) => s && !seen.has(s) && seen.add(s))

  const results = await Promise.allSettled(unique.map(async (slug) => {
    try {
      const anime = await scrapeAnimeDetail(slug)
      return { slug, anime }
    } catch {
      return { slug, anime: null }
    }
  }))

  return results.map((r) => r.status === 'fulfilled' ? r.value : { slug: '', anime: null })
})

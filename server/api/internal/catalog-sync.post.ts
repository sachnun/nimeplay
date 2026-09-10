import { runCatalogSync, type CatalogMode } from '../../utils/refresh'

defineRouteMeta({
  openAPI: {
    tags: ['Internal'],
    summary: 'Trigger catalog sync',
    description: 'Manually triggers a catalog sync. Use mode seed for first-time backfill (completed pages first, then ongoing) or rolling for periodic ongoing updates. Guarded by a D1 lock so concurrent triggers are rejected.',
    requestBody: {
      required: false,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              mode: { type: 'string', enum: ['seed', 'rolling'], default: 'rolling' },
            },
          },
        },
      },
    },
    responses: {
      '200': { description: 'Catalog sync stats' },
      '409': { description: 'A sync with the same mode is already running' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const body = await readBody<{ mode?: string }>(event).catch(() => null)
  const mode: CatalogMode = body?.mode === 'seed' ? 'seed' : 'rolling'
  try {
    return await runCatalogSync(mode)
  }
  catch (error) {
    throw createError({
      statusCode: 409,
      statusMessage: error instanceof Error ? error.message : 'Catalog sync already running',
    })
  }
})

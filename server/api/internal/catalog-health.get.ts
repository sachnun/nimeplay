import { getCatalogHealth } from '../../utils/refresh'

defineRouteMeta({
  openAPI: {
    tags: ['Internal'],
    summary: 'Catalog health',
    description: 'Returns pending metadata count, last catalog sync stats, and active sync config.',
    responses: {
      '200': { description: 'Catalog health payload' },
    },
  },
})

export default defineEventHandler(() => {
  return getCatalogHealth()
})

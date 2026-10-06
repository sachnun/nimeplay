import { defineRouteMeta } from 'nitro'
import { defineEventHandler } from 'nuxt/server'

defineRouteMeta({
  openAPI: {
    tags: ['Genre'],
    summary: 'List genres',
    description: 'Full genre list.',
    responses: {
      '200': {
        description: 'Genre list',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['data'],
              properties: {
                data: { type: 'array', items: { $ref: '#/components/schemas/Genre' } },
              },
            },
            example: {
              data: [
                { name: 'Action', slug: 'action' },
                { name: 'Adventure', slug: 'adventure' },
                { name: 'Fantasy', slug: 'fantasy' },
              ],
            },
          },
        },
      },
    },
  },
})

export default defineEventHandler(async () => {
  const rows = await getGenreList()
  return { data: rows }
})

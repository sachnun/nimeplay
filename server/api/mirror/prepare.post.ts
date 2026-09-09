import type { PrepareResult } from '../../utils/prepare'

defineRouteMeta({
  openAPI: {
    tags: ['Mirror'],
    summary: 'Resolve mirror to direct stream',
    description: 'Opens a mirror token, resolves the embedded page and extracts the direct stream URL sealed behind a stream token. Direct streams only, no iframe fallback.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['dataContent'],
            properties: {
              dataContent: { type: 'string', description: 'Mirror token from the episode data attribute' },
              refresh: { type: 'boolean', description: 'Set to true to bypass the cached resolve and extract the direct stream live' },
            },
          },
        },
      },
    },
    responses: {
      '200': { description: 'Direct play URL and stream kind' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const body = await readBody<{ dataContent: string, refresh?: boolean }>(event)
  if (!body?.dataContent) return emptyPrepareResult()
  if (body.refresh) cache.delete('prepare', body.dataContent)

  const result = await prepareMirror(body.dataContent, getRequestURL(event).origin) as PrepareResult
  if (!result.ok) cache.delete('prepare', body.dataContent)
  return result
})

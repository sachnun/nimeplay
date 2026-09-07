import { emptyPrepareResult, prepareMirror } from '../../utils/prepare'


defineRouteMeta({
  openAPI: {
    tags: ['Mirror'],
    summary: 'Resolve mirror embed',
    description: 'Opens a mirror token, resolves the embedded player and optionally extracts the direct stream URL (sealed behind a stream token).',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['dataContent'],
            properties: {
              dataContent: { type: 'string', description: 'Mirror token from the episode data attribute' },
              extract: { type: 'boolean', description: 'Also extract the direct stream URL' },
            },
          },
        },
      },
    },
    responses: {
      '200': { description: 'Resolved iframe/play URL and stream kind' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const body = await readBody<{ dataContent: string; extract: boolean }>(event)
  if (!body?.dataContent) return emptyPrepareResult()

  setHeader(event, 'Cache-Control', 'public, max-age=120, stale-while-revalidate=300')
  const origin = getRequestURL(event).origin
  return prepareMirror(body.dataContent, body.extract, origin)
})

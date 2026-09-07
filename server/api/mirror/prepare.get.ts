import { emptyPrepareResult, isExtractableSource, prepareMirror } from '../../utils/prepare'

defineRouteMeta({
  openAPI: {
    tags: ['Mirror'],
    summary: 'Resolve mirror embed',
    description: 'Resolves a mirror token from query params. GET variant is cacheable for faster initial playback.',
    parameters: [
      {
        name: 'dataContent',
        in: 'query',
        required: true,
        schema: { type: 'string' },
        description: 'Mirror token from the episode data attribute',
      },
      {
        name: 'extract',
        in: 'query',
        required: false,
        schema: { type: 'boolean' },
        description: 'Also extract the direct stream URL',
      },
    ],
    responses: {
      200: { description: 'Resolved iframe/play URL and stream kind' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const dataContent = String(query.dataContent || '')
  const extractParam = query.extract
  const extract = extractParam === undefined || extractParam === ''
    ? isExtractableSource(String(query.name || 'vidhide'))
    : extractParam === '1' || extractParam === 'true'

  if (!dataContent) return emptyPrepareResult()

  setHeader(event, 'Cache-Control', 'public, max-age=120, stale-while-revalidate=300')
  return prepareMirror(dataContent, extract)
})

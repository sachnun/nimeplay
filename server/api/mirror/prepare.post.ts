import { isPlaceholderStreamUrl } from '../../utils/extractors/hosts'

type PrepareResult = {
  playUrl: string | null
  kind: 'hls' | 'file' | null
  ok: boolean
}

const MIRROR_PREPARE_TTL = 10 * 60 * 1000

function emptyResult(): PrepareResult {
  return { playUrl: null, kind: null, ok: false }
}

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
  if (!body?.dataContent) return emptyResult()
  if (body.refresh) cache.delete('prepare', body.dataContent)

  const result = await cache.get('prepare', body.dataContent, MIRROR_PREPARE_TTL, async (): Promise<PrepareResult> => {
    const mirrorId = await openStreamToken(body.dataContent)
    if (!mirrorId || isPlaceholderStreamUrl(mirrorId)) return emptyResult()
    const embedUrl = await resolvemirror(mirrorId)
    if (!embedUrl || isPlaceholderStreamUrl(embedUrl)) return emptyResult()

    const directUrl = await extractStreamUrl(embedUrl)
    if (!directUrl || isPlaceholderStreamUrl(directUrl)) return emptyResult()

    const kind = await detectStreamKind(directUrl)
    const token = await sealStreamToken(directUrl)
    const origin = getRequestURL(event).origin
    return { playUrl: proxiedStreamPath(origin, token), kind, ok: true }
  }) as PrepareResult
  if (!result.ok) cache.delete('prepare', body.dataContent)
  return result
})

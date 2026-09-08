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
  const body = await readBody<{ dataContent: string }>(event)
  if (!body?.dataContent) return emptyResult()

  return cache.get('prepare', body.dataContent, MIRROR_PREPARE_TTL, async (): Promise<PrepareResult> => {
    const mirrorId = await openStreamToken(body.dataContent)
    if (!mirrorId) return emptyResult()
    const embedUrl = await resolvemirror(mirrorId)
    if (!embedUrl) return emptyResult()

    const directUrl = await extractStreamUrl(embedUrl)
    if (!directUrl) return emptyResult()

    const kind = await detectStreamKind(directUrl)
    const token = await sealStreamToken(directUrl)
    const origin = getRequestURL(event).origin
    return { playUrl: proxiedStreamPath(origin, token), kind, ok: true }
  }) as Promise<PrepareResult>
})

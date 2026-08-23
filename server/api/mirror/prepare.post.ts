type PrepareResult = {
  iframeUrl: string | null
  playUrl: string | null
  kind: 'hls' | 'file' | null
  ok: boolean
}

const MIRROR_PREPARE_TTL = 10 * 60 * 1000

function emptyResult(iframeUrl: string | null = null): PrepareResult {
  return { iframeUrl, playUrl: null, kind: null, ok: false }
}

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
  if (!body?.dataContent) return emptyResult()

  return cache.prepare.get(body.extract, body.dataContent, MIRROR_PREPARE_TTL, async (): Promise<PrepareResult> => {
    const mirrorId = await openStreamToken(body.dataContent)
    if (!mirrorId) return emptyResult()
    const iframeUrl = await resolvemirror(mirrorId)
    if (!iframeUrl) return emptyResult()
    if (!body.extract) return { ...emptyResult(iframeUrl), ok: await probeIframeUrl(iframeUrl) }

    const extracted = await extractStreamUrl(iframeUrl)
    if (!extracted.url) return emptyResult(extracted.iframeUrl)

    const kind = await detectStreamKind(extracted.url)
    const token = await sealStreamToken(extracted.url)
    const origin = getRequestURL(event).origin
    return { iframeUrl: extracted.iframeUrl, playUrl: proxiedStreamPath(origin, token), kind, ok: true }
  }) as Promise<PrepareResult>
})

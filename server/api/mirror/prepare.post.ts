

const MIRROR_PREPARE_TTL = 10 * 60 * 1000

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  const body = await readBody<{ dataContent: string; extract: boolean }>(event)
  if (!body?.dataContent) return { iframeUrl: null, proxiedUrl: null, ok: false }

  return cached(
    `prepare-mirror:${body.extract ? 'extract' : 'probe'}:${body.dataContent}`,
    MIRROR_PREPARE_TTL,
    async () => {
      const iframeUrl = await resolvemirror(body.dataContent)
      if (!iframeUrl) return { iframeUrl: null, proxiedUrl: null, ok: false }
      if (!body.extract) return { iframeUrl, proxiedUrl: null, ok: await probeIframeUrl(iframeUrl) }

      const extracted = await extractStreamUrl(iframeUrl)
      return { iframeUrl: extracted.iframeUrl, proxiedUrl: extracted.proxiedUrl, ok: !!extracted.proxiedUrl }
    },
  )
})

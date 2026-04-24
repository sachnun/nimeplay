import { probeIframeUrl } from '../../utils/extractors'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ iframeUrl?: string }>(event)
  if (!body?.iframeUrl) throw createError({ statusCode: 400, statusMessage: 'Missing iframeUrl' })
  return { ok: await probeIframeUrl(body.iframeUrl) }
})

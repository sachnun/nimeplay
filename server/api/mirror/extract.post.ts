import { extractStreamUrl } from '../../utils/extractors'
import { setApiCorsHeaders } from '../../utils/cors'

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  const body = await readBody<{ iframeUrl: string }>(event)
  return extractStreamUrl(body?.iframeUrl || '')
})

import { resolvemirror } from '../../utils/scraper'
import { setApiCorsHeaders } from '../../utils/cors'

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  const body = await readBody<{ dataContent: string }>(event)
  return { iframeUrl: await resolvemirror(body?.dataContent || '') }
})

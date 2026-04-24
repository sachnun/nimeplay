import { resolvemirror } from '../../utils/scraper'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ dataContent?: string }>(event)
  if (!body?.dataContent) throw createError({ statusCode: 400, statusMessage: 'Missing dataContent' })
  const iframeUrl = await resolvemirror(body.dataContent)
  return { iframeUrl: iframeUrl || null }
})

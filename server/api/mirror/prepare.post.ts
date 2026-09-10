import type { PrepareResult } from '../../utils/prepare'

defineRouteMeta({
  openAPI: false,
})

export default defineEventHandler(async (event) => {
  const body = await readBody<{ dataContent: string, refresh?: boolean }>(event)
  if (!body?.dataContent) return emptyPrepareResult()
  if (body.refresh) cache.delete('prepare', body.dataContent)

  const result = await prepareMirror(body.dataContent, getRequestURL(event).origin) as PrepareResult
  if (!result.ok) cache.delete('prepare', body.dataContent)
  return result
})

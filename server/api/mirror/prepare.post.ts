export default defineEventHandler(async (event) => {
  const body = await readBody<{ dataContent: string }>(event)
  if (!body?.dataContent) return emptyPrepareResult()
  return prepareMirror(body.dataContent, getRequestURL(event).origin)
})

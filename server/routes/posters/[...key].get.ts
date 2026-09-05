import { createError, getRouterParam } from 'h3'

export default defineEventHandler((event) => {
  const key = getRouterParam(event, 'key')
  if (!key) throw createError({ statusCode: 404 })
  return sendRedirect(event, `/r2/posters/${key}`, 301)
})

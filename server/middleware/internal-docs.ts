import { defineEventHandler, getRequestURL } from 'nuxt/server'

const INTERNAL_PATHS = new Set(['/_openapi.json', '/_swagger'])

export default defineEventHandler(event => {
  const { pathname } = getRequestURL(event)
  if (!INTERNAL_PATHS.has(pathname)) return

  const context = event.context as { '~internal'?: unknown; nuxt?: Record<string, unknown> }
  if (context['~internal'] || context.nuxt?.['~internal']) return

  return new Response(JSON.stringify({ status: 404, message: 'Not Found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
})

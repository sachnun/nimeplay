import { defineEventHandler, getRequestURL } from 'h3'

const EXTRA_ROUTES = ['/openapi.json', '/docs']

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/') && !EXTRA_ROUTES.includes(path)) return

  setApiCorsHeaders(event)
  if (event.method === 'OPTIONS') return apiCorsPreflightResponse()
})

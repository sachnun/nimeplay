import { defineEventHandler, getRequestURL, setHeader } from 'h3'

const EXTRA_ROUTES = ['/openapi.json', '/docs']

const API_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, TRPC-Accept, X-TRPC-Source',
  'Access-Control-Max-Age': '86400',
}

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/') && !EXTRA_ROUTES.includes(path)) return

  for (const [name, value] of Object.entries(API_CORS_HEADERS)) setHeader(event, name, value)
  if (event.method === 'OPTIONS') return new Response(null, { status: 204, headers: API_CORS_HEADERS })
})

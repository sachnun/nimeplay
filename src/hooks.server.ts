import type { Handle } from '@sveltejs/kit/hooks'
import * as appEnv from '$app/env/private'
import { registerNeonDatabase } from '#lib/server/utils/db/neon'
import { setRuntimeEnv } from '#lib/server/utils/env'

setRuntimeEnv(appEnv)
registerNeonDatabase()

const CORS_PATHS = ['/api/', '/openapi.json', '/docs']

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
  'access-control-max-age': '86400',
}

interface CacheRule {
  test: (pathname: string) => boolean
  header: string
}

const CACHE_RULES: CacheRule[] = [
  { test: pathname => pathname.startsWith('/media/'), header: 'public, max-age=86400, s-maxage=86400' },
  { test: pathname => pathname === '/api/v1/genres', header: 'public, max-age=3600, s-maxage=3600' },
  { test: pathname => pathname === '/api/v1/anime', header: 'public, max-age=60, s-maxage=60' },
  { test: pathname => /^\/api\/v1\/anime\/\d+$/.test(pathname), header: 'public, max-age=60, s-maxage=60' },
  { test: pathname => pathname.startsWith('/api/v1/genre/'), header: 'public, max-age=300, s-maxage=300' },
  { test: pathname => /^\/anime\/\d+$/.test(pathname), header: 'public, max-age=300, s-maxage=300' },
  { test: pathname => pathname === '/', header: 'public, max-age=120, s-maxage=120' },
]

function needsCors(pathname: string): boolean {
  return CORS_PATHS.some(prefix => pathname.startsWith(prefix))
}

function cacheHeader(pathname: string): string | null {
  if (pathname.startsWith('/api/stream')) return 'no-store'
  return CACHE_RULES.find(rule => rule.test(pathname))?.header ?? null
}

export const handle: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname

  if (needsCors(pathname) && event.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const response = await resolve(event)

  if (needsCors(pathname)) {
    for (const [key, value] of Object.entries(CORS_HEADERS)) response.headers.set(key, value)
  }

  const cache = cacheHeader(pathname)
  if (cache && !response.headers.has('cache-control')) response.headers.set('cache-control', cache)

  return response
}

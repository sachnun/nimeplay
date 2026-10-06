import { createError, defineEventHandler, getRouterParam } from 'nuxt/server'

const MEDIA_CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable'

export default defineEventHandler(async event => {
  const key = getRouterParam(event, 'key', { decode: true })
  if (!key) throw createError({ status: 400, statusText: 'Missing media key' })
  if (!isValidMediaKey(key)) throw createError({ status: 404, statusText: 'Not found' })

  const cached = await getCachedMedia(key)
  if (!cached) throw createError({ status: 404, statusText: 'Not found' })

  const headers: Record<string, string> = {
    'Cache-Control': MEDIA_CACHE_CONTROL,
    'Content-Type': cached.contentType,
  }
  if (cached.etag) headers.ETag = cached.etag
  return new Response(cached.body, { headers })
})

import { createError, getRouterParam } from 'h3'
import {
  fetchRemoteMedia,
  getCachedMedia,
  isValidMediaKey,
  keyToOrigin,
  storeMedia,
} from '../../utils/r2'

const MEDIA_CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable'

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key')
  if (!key) throw createError({ statusCode: 400, statusMessage: 'Missing media key' })
  if (!isValidMediaKey(key)) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  // 1. Check R2 Cache (fastest)
  const cached = await getCachedMedia(key)
  if (cached?.etag) {
    const ifNoneMatch = getRequestHeader(event, 'if-none-match')
    if (ifNoneMatch && ifNoneMatch === cached.etag) {
      setResponseStatus(event, 304)
      setHeader(event, 'ETag', cached.etag)
      setHeader(event, 'Cache-Control', MEDIA_CACHE_CONTROL)
      return null
    }
  }
  if (cached) {
    const headers: Record<string, string> = {
      'Cache-Control': MEDIA_CACHE_CONTROL,
      'Content-Type': cached.contentType,
    }
    if (cached.etag) headers.ETag = cached.etag
    return new Response(cached.body, { headers })
  }

  // 2. On-demand cache fill (if not yet in R2)
  const origin = keyToOrigin(key)
  if (!origin) throw createError({ statusCode: 404, statusMessage: 'Invalid origin' })

  try {
    const { contentType, bytes } = await fetchRemoteMedia(origin)
    const store = storeMedia(key, bytes, contentType).catch(() => {})
    const withWaitUntil = event as { waitUntil?: (p: Promise<unknown>) => void }
    if (withWaitUntil.waitUntil) withWaitUntil.waitUntil(store)
    else await store
    return new Response(bytes, {
      headers: {
        'Cache-Control': MEDIA_CACHE_CONTROL,
        'Content-Type': contentType,
      },
    })
  }
  catch {
    return Response.redirect(origin, 302)
  }
})

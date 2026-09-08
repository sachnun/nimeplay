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

  const cached = await getCachedMedia(key)
  if (cached) {
    const headers: Record<string, string> = {
      'Cache-Control': MEDIA_CACHE_CONTROL,
      'Content-Type': cached.contentType,
    }
    if (cached.etag) headers.ETag = cached.etag
    return new Response(cached.body, { headers })
  }

  const origin = keyToOrigin(key)
  if (!origin) throw createError({ statusCode: 404, statusMessage: 'Invalid origin' })

  try {
    const { contentType, bytes } = await fetchRemoteMedia(origin)
    await storeMedia(key, bytes, contentType).catch(() => {})
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

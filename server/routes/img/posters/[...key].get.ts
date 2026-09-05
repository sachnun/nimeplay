import { createError, getRouterParam } from 'h3'
import { fetchPosterBytes, getCachedPoster, isPosterKey, posterOrigin, storePoster } from '../../../utils/posters'

const POSTER_CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable'

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key')
  if (!key) throw createError({ statusCode: 400, statusMessage: 'Missing poster key' })
  if (!isPosterKey(key)) throw createError({ statusCode: 404, statusMessage: 'Poster not found' })

  const cached = await getCachedPoster(key)
  if (cached) {
    const headers: Record<string, string> = {
      'Cache-Control': POSTER_CACHE_CONTROL,
      'Content-Type': cached.contentType,
    }
    if (cached.etag) headers['ETag'] = cached.etag
    return new Response(cached.body, { headers })
  }

  const origin = posterOrigin(key)
  let data: { contentType: string, bytes: ArrayBuffer }
  try {
    data = await fetchPosterBytes(origin)
  }
  catch {
    return Response.redirect(origin, 302)
  }
  try {
    await storePoster(key, data.bytes, data.contentType)
  }
  catch {
    // Serve straight from upstream when the cache write fails; the browser
    // cache header below still limits repeat fetches.
  }
  return new Response(data.bytes, {
    headers: {
      'Cache-Control': POSTER_CACHE_CONTROL,
      'Content-Type': data.contentType,
    },
  })
})

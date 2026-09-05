import { createError, getRouterParam } from 'h3'
import { getCachedPoster, isPosterKey, posterOrigin, storePoster } from '../../../utils/posters'

const POSTER_CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable'
const UPSTREAM_TIMEOUT_MS = 10000

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
  let upstream: Response
  try {
    upstream = await fetch(origin, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
  }
  catch {
    return Response.redirect(origin, 302)
  }
  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => {})
    return Response.redirect(origin, 302)
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'
  const bytes = await upstream.arrayBuffer()
  if (contentType.startsWith('image/')) {
    try {
      await storePoster(key, bytes, contentType)
    }
    catch {
      // Serve straight from upstream when the cache write fails; the browser
      // cache header below still limits repeat fetches.
    }
  }
  return new Response(bytes, {
    headers: {
      'Cache-Control': POSTER_CACHE_CONTROL,
      'Content-Type': contentType,
    },
  })
})

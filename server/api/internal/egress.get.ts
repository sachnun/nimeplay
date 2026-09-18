const INTERNAL_KEY = 'nimeplay'
const ALLOWED_EGRESS_HOSTS = /(^|\.)otakudesu\.[a-z.]+$/i

export default defineEventHandler(async (event) => {
  const url = getQuery(event).url
  if (typeof url === 'string' && url) {
    if (getHeader(event, 'x-nimeplay-key') !== INTERNAL_KEY) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
    let target: URL
    try {
      target = new URL(url)
    }
    catch {
      throw createError({ statusCode: 400, statusMessage: 'Invalid url' })
    }
    if (!['http:', 'https:'].includes(target.protocol) || !ALLOWED_EGRESS_HOSTS.test(target.hostname)) {
      throw createError({ statusCode: 403, statusMessage: 'Host not allowed' })
    }
    const res = await fetch(target.toString(), {
      headers: getSpoofHeaders(target.toString(), 'navigate'),
      signal: AbortSignal.timeout(8000),
    })
    setResponseStatus(event, res.status)
    setHeader(event, 'content-type', res.headers.get('content-type') ?? 'text/html; charset=utf-8')
    setHeader(event, 'cache-control', 'no-store')
    return res.body
  }

  const placement = getHeader(event, 'cf-placement') ?? null
  try {
    const info = await $fetch<{ ip?: string, country?: string, region?: string, city?: string }>(
      'https://ipinfo.io/json',
      { signal: AbortSignal.timeout(8000) },
    )
    return {
      ip: info.ip ?? null,
      country: info.country ?? null,
      region: info.region ?? null,
      city: info.city ?? null,
      placement,
    }
  }
  catch {
    return { ip: null, country: null, region: null, city: null, placement }
  }
})

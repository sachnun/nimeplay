import { getSpoofHeaders } from '../../utils/spoof'

export default defineEventHandler(async (event) => {
  const url = getQuery(event).url
  if (typeof url !== 'string' || !url) throw createError({ statusCode: 400, statusMessage: 'Missing url' })

  const res = await fetch(url, {
    headers: getSpoofHeaders(url, 'iframe'),
  })

  if (!res.ok) throw createError({ statusCode: res.status, statusMessage: 'Failed to fetch playlist' })

  setHeader(event, 'Content-Type', res.headers.get('Content-Type') || 'application/vnd.apple.mpegurl')
  return await res.text()
})

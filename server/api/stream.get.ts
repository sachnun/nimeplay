import { getSpoofHeaders } from '../utils/spoof'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const url = String(query.url || '')

  if (!url) throw createError({ statusCode: 400, statusMessage: 'Missing stream URL' })

  let target: URL
  try {
    target = new URL(url)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid stream URL' })
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid stream protocol' })
  }

  const res = await fetch(target, {
    headers: getSpoofHeaders(`${target.origin}/`, 'iframe'),
  })

  if (!res.ok) {
    throw createError({ statusCode: res.status, statusMessage: 'Failed to fetch stream' })
  }

  setHeader(event, 'Content-Type', res.headers.get('content-type') || 'application/vnd.apple.mpegurl')
  setHeader(event, 'Cache-Control', 'no-store')
  return res.text()
})

import { error } from '@sveltejs/kit'
import { getCachedMedia, isValidMediaKey } from '#lib/server/utils/media'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ params }) => {
  const key = params.key
  if (!key) error(400, 'Missing media key')
  if (!isValidMediaKey(key)) error(404, 'Not found')

  const cached = await getCachedMedia(key)
  if (!cached) error(404, 'Not found')

  const headers: Record<string, string> = { 'Content-Type': cached.contentType }
  if (cached.etag) headers.ETag = cached.etag
  return new Response(cached.body, { headers })
}

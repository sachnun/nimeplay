import { error, json } from '@sveltejs/kit'
import { getGenreAnimePage } from '#lib/server/utils/db/queries/genres'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ params, url }) => {
  const slug = params.slug || ''
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)

  const result = await getGenreAnimePage(slug, page)
  if (!result) error(404, 'Genre not found')
  return json({ data: result.anime, page, totalPages: result.totalPages })
}

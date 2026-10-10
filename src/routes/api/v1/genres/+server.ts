import { json } from '@sveltejs/kit'
import { getGenreList } from '#lib/server/utils/db/queries/genres'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async () => {
  const rows = await getGenreList()
  return json({ data: rows })
}

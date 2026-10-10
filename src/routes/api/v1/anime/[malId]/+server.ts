import { error, json } from '@sveltejs/kit'
import { getAnimeDetail } from '#lib/server/utils/db/queries/detail'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ params }) => {
  const malId = Number(params.malId)
  if (!Number.isInteger(malId) || malId <= 0) error(400, 'Invalid MAL id')

  const detail = await getAnimeDetail(malId)
  if (!detail) error(404, 'Anime not found')
  return json(detail)
}

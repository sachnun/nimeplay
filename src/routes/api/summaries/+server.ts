import { json } from '@sveltejs/kit'
import { getAnimeSummaries } from '#lib/server/utils/db/queries/detail'
import type { RequestHandler } from './$types'

const MAX_IDS = 100

export const GET: RequestHandler = async ({ url }) => {
  const ids = url.searchParams
    .getAll('malId')
    .flatMap(value => value.split(','))
    .map(value => Number(value.trim()))
    .filter(value => Number.isInteger(value) && value > 0)
    .slice(0, MAX_IDS)

  return json({ data: await getAnimeSummaries(ids) })
}

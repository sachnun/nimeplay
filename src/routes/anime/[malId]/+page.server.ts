import { redirect } from '@sveltejs/kit'
import { getAnimeDetail } from '#lib/server/utils/db/queries/detail'
import { isServerError } from '#lib/error'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params }) => {
  const malId = Number(params.malId) || 0
  try {
    const detail = await getAnimeDetail(malId)
    if (!detail) redirect(307, '/')
    return { anime: detail, detailFailed: false }
  } catch (error) {
    if (isServerError(error)) return { anime: null, detailFailed: true }
    throw error
  }
}

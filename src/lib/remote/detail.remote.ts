import { redirect } from '@sveltejs/kit'
import { query } from '$app/server'
import { malIdSchema } from '#lib/schemas'
import { getAnimeDetail as getAnimeDetailQuery } from '#lib/server/utils/db/queries/detail'
import { isServerError } from '#lib/error'

export const getAnimeDetail = query(malIdSchema, async ({ malId }) => {
  try {
    const detail = await getAnimeDetailQuery(malId)
    if (!detail) redirect(307, '/')
    return detail
  } catch (error) {
    if (isServerError(error)) return null
    throw error
  }
})

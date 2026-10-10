import { getGenreList } from '#lib/server/utils/db/queries/genres'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async () => {
  try {
    const genres = await getGenreList()
    return { genres }
  } catch {
    return { genres: [] }
  }
}

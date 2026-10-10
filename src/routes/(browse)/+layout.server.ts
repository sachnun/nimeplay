import { fetchGenres } from '#lib/api'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ fetch }) => {
  try {
    const genres = await fetchGenres(fetch)
    return { genres }
  } catch {
    return { genres: [] }
  }
}

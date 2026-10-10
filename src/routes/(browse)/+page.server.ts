import { fetchHome } from '#lib/api'
import { isServerError } from '#lib/error'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ fetch }) => {
  try {
    const data = await fetchHome(fetch)
    return { home: data, homeFailed: false }
  } catch (error) {
    return {
      home: {
        ongoingData: { anime: [], totalPages: 1 },
        completedData: { anime: [], totalPages: 1 },
        genres: [],
      },
      homeFailed: isServerError(error),
    }
  }
}

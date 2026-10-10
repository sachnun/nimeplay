import { listAnimePage } from '#lib/server/utils/db/queries/catalog'
import { isServerError } from '#lib/error'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async () => {
  try {
    const [ongoingData, completedData] = await Promise.all([
      listAnimePage('ONGOING', 1),
      listAnimePage('COMPLETED', 1),
    ])
    return { home: { ongoingData, completedData }, homeFailed: false }
  } catch (error) {
    return {
      home: {
        ongoingData: { anime: [], totalPages: 1 },
        completedData: { anime: [], totalPages: 1 },
      },
      homeFailed: isServerError(error),
    }
  }
}

import { syncLatestAnime } from '../../../services/animeSync'

function authorized(event: Parameters<Parameters<typeof defineEventHandler>[0]>[0]) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return getHeader(event, 'authorization') === `Bearer ${secret}`
}

export default defineEventHandler(async (event) => {
  if (!authorized(event)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  return syncLatestAnime()
})

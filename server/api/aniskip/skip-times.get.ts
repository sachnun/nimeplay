import { fetchSkipTimes } from '../../utils/aniskip'
import { setApiCorsHeaders } from '../../utils/cors'

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  const query = getQuery(event)
  const malId = Number(query.malId)
  const episode = Number(query.episode)
  const episodeLength = Number(query.episodeLength)

  if (!malId || !episode || !episodeLength) return []
  return fetchSkipTimes(malId, episode, episodeLength)
})

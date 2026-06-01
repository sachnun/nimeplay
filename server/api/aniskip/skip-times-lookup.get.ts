import { fetchMalId, fetchSkipTimes } from '../../utils/aniskip'
import { setApiCorsHeaders } from '../../utils/cors'

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  const query = getQuery(event)
  const title = String(query.title || '').trim()
  const episode = Number(query.episode)
  const episodeLength = Number(query.episodeLength)

  if (!title || !episode || !episodeLength) return { malId: null, skipTimes: [] }
  const malId = await fetchMalId(title)
  return { malId, skipTimes: malId ? await fetchSkipTimes(malId, episode, episodeLength) : [] }
})

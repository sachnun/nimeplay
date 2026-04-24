import { fetchSkipTimes } from '../../utils/aniskip'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const malId = Number.parseInt(String(query.malId || '0'))
  const episode = Number.parseInt(String(query.episode || '0'))
  const episodeLength = Number.parseFloat(String(query.episodeLength || '0'))
  if (!malId || !episode || !episodeLength) return []
  return fetchSkipTimes(malId, episode, episodeLength)
})

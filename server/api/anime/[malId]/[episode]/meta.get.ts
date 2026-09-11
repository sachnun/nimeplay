import { createError, getRouterParam } from 'h3'
import { getEpisodeNumbers, resolveEpisode } from '../../../../utils/queries'

export default defineEventHandler(async (event) => {
  const malId = Number(getRouterParam(event, 'malId'))
  const episodeNumber = Number(getRouterParam(event, 'episode'))

  if (!Number.isInteger(malId) || malId <= 0 || !Number.isInteger(episodeNumber) || episodeNumber <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid MAL id or episode number' })
  }

  const resolved = await resolveEpisode(malId, episodeNumber)
  if (!resolved) throw createError({ statusCode: 404, statusMessage: 'Episode not found' })

  const episodeNumbers = await getEpisodeNumbers(resolved.animeSlug, event)

  return {
    anime: { malId, title: resolved.anime.title, thumbnail: resolved.anime.thumbnail },
    episodeNumber,
    episodeTitle: resolved.episodeTitle,
    episodes: episodeNumbers,
  }
})

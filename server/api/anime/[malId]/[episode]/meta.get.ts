import { createError, getRouterParam } from 'h3'
import { getEpisodeNumbers, resolveEpisode } from '../../../../utils/queries'

defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'Get episode header metadata',
    description: 'DB-only fast path for the player header. No upstream scrape, so the title can render while mirrors resolve.',
    parameters: [
      {
        name: 'malId',
        in: 'path',
        required: true,
        schema: { type: 'integer' },
        description: 'MyAnimeList ID',
      },
      {
        name: 'episode',
        in: 'path',
        required: true,
        schema: { type: 'integer', minimum: 1 },
        description: 'Episode number',
      },
    ],
    responses: {
      '200': { description: 'Anime title, episode title from DB, and the full episode list' },
      '404': { description: 'Episode not found' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const malId = Number(getRouterParam(event, 'malId'))
  const episodeNumber = Number(getRouterParam(event, 'episode'))

  if (!Number.isInteger(malId) || malId <= 0 || !Number.isInteger(episodeNumber) || episodeNumber <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid MAL id or episode number' })
  }

  const resolved = await resolveEpisode(malId, episodeNumber)
  if (!resolved) throw createError({ statusCode: 404, statusMessage: 'Episode not found' })

  const episodeNumbers = await getEpisodeNumbers(resolved.animeSlug)

  return {
    anime: { malId, title: resolved.anime.title, thumbnail: resolved.anime.thumbnail },
    episodeNumber,
    episodeTitle: resolved.episodeTitle,
    episodes: episodeNumbers,
  }
})

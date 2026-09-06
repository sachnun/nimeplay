import { createError, getRouterParam } from 'h3'
import { getEpisodeNumbers, resolveEpisode } from '../../../utils/queries'
import { scrapeEpisode } from '../../../utils/sources'

defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'Get episode playback data',
    description: 'Resolves an episode by MyAnimeList ID and episode number. Stream sources are extracted live at play time.',
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
      '200': { description: 'Playback data including stream mirrors and the full episode list' },
      '404': { description: 'Episode not found or unavailable' },
    },
  },
})

export default defineCachedEventHandler(async (event) => {
  const malId = Number(getRouterParam(event, 'malId'))
  const episodeNumber = Number(getRouterParam(event, 'episode'))

  if (!Number.isInteger(malId) || malId <= 0 || !Number.isInteger(episodeNumber) || episodeNumber <= 0 || episodeNumber > 5000) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid MAL id or episode number' })
  }

  const resolved = await resolveEpisode(malId, episodeNumber)
  if (!resolved) throw createError({ statusCode: 404, statusMessage: 'Episode not found' })

  const [scraped, episodeNumbers] = await Promise.all([
    scrapeEpisode(resolved.sourceSlug),
    getEpisodeNumbers(resolved.animeSlug),
  ])
  if (!scraped) throw createError({ statusCode: 404, statusMessage: 'Episode unavailable' })

  setHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300')
  return {
    anime: { malId, title: resolved.anime.title, thumbnail: resolved.anime.thumbnail },
    episodeNumber,
    episode: {
      title: scraped.title || resolved.episodeTitle,
      defaultIframeSrc: scraped.defaultIframeSrc,
      mirrors: scraped.mirrors,
      thumbnail: scraped.thumbnail || resolved.anime.thumbnail,
    },
    episodes: episodeNumbers,
  }
}, {
  maxAge: 60,
  staleMaxAge: 300,
  getKey: (event) => `episode:v1:${getRouterParam(event, 'malId')}:${getRouterParam(event, 'episode')}`,
})

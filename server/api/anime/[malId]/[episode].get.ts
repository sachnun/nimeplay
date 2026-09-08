import { createError, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { anime } from '../../../database/schema'
import { db } from '../../../utils/db'
import { getEpisodeNumbers, resolveEpisode } from '../../../utils/queries'
import { refreshAnimeBySlug } from '../../../utils/refresh'
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

export default defineEventHandler(async (event) => {
  const malId = Number(getRouterParam(event, 'malId'))
  const episodeNumber = Number(getRouterParam(event, 'episode'))

  if (!Number.isInteger(malId) || malId <= 0 || !Number.isInteger(episodeNumber) || episodeNumber <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid MAL id or episode number' })
  }

  let resolved = await resolveEpisode(malId, episodeNumber)
  if (!resolved) {
    const [row] = await db().select({ slug: anime.slug, title: anime.title }).from(anime).where(eq(anime.malId, malId)).limit(1)
    if (row) {
      try {
        await refreshAnimeBySlug(row.slug, row.title, false)
      }
      catch (error) {
        console.warn(`[episode] on-demand refresh failed ${malId}:`, error instanceof Error ? error.message : error)
      }
      resolved = await resolveEpisode(malId, episodeNumber)
    }
  }
  if (!resolved) throw createError({ statusCode: 404, statusMessage: 'Episode not found' })

  const [scraped, episodeNumbers] = await Promise.all([
    scrapeEpisode(resolved.sourceSlug),
    getEpisodeNumbers(resolved.animeSlug),
  ])
  if (!scraped) throw createError({ statusCode: 404, statusMessage: 'Episode unavailable' })

  return {
    anime: { malId, title: resolved.anime.title, thumbnail: resolved.anime.thumbnail },
    episodeNumber,
    episode: {
      title: scraped.title || resolved.episodeTitle,
      mirrors: scraped.mirrors,
      thumbnail: scraped.thumbnail || resolved.anime.thumbnail,
    },
    episodes: episodeNumbers,
  }
})

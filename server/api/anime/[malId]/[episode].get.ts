import { asc, eq } from 'drizzle-orm'
import { createError, getRouterParam } from 'h3'
import { db } from '../../../utils/db'
import { anime, episodes } from '../../../database/schema'
import { resolveEpisode } from '../../../utils/queries'
import { scrapeEpisode } from '../../../utils/scraper'

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

  const resolved = await resolveEpisode(malId, episodeNumber)
  if (!resolved) throw createError({ statusCode: 404, statusMessage: 'Episode not found' })

  const scraped = await scrapeEpisode(resolved.sourceSlug)
  if (!scraped) throw createError({ statusCode: 404, statusMessage: 'Episode unavailable' })

  // Full episode list for the drawer, keyed by number instead of source slug.
  const list = await db()
    .select({ number: episodes.number })
    .from(episodes)
    .innerJoin(anime, eq(anime.slug, episodes.animeSlug))
    .where(eq(anime.malId, malId))
    .orderBy(asc(episodes.number))

  return {
    anime: { malId, title: resolved.anime.title, thumbnail: resolved.anime.thumbnail },
    episodeNumber,
    episode: {
      title: scraped.title || resolved.episodeTitle,
      defaultIframeSrc: scraped.defaultIframeSrc,
      mirrors: scraped.mirrors,
      thumbnail: scraped.thumbnail || resolved.anime.thumbnail,
    },
    episodes: list.map(entry => entry.number),
  }
})

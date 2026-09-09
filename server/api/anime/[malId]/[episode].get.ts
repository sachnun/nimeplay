import { createError, getQuery, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { anime } from '../../../database/schema'
import { cache } from '../../../utils/cache'
import { db } from '../../../utils/db'
import { getEpisodeNumbers, resolveEpisode } from '../../../utils/queries'
import { refreshAnimeBySlug } from '../../../utils/refresh'
import { scrapeEpisode, scrapeEpisodeFresh } from '../../../utils/sources'

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
      {
        name: 'refresh',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['1'] },
        description: 'Set to 1 to re-scrape the upstream site and bypass caches, picking up newly registered upstream mirrors on demand',
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

  const refresh = getQuery(event).refresh === '1'

  let resolved = await resolveEpisode(malId, episodeNumber)
  if (!resolved || refresh) {
    const [row] = await db().select({ slug: anime.slug, title: anime.title }).from(anime).where(eq(anime.malId, malId)).limit(1)
    if (row) {
      try {
        await refreshAnimeBySlug(row.slug, row.title, false)
      }
      catch (error) {
        console.warn(`[episode] on-demand refresh failed ${malId}:`, error instanceof Error ? error.message : error)
      }
      if (refresh) cache.delete('episodes', row.slug)
      resolved = await resolveEpisode(malId, episodeNumber)
    }
  }
  if (!resolved) throw createError({ statusCode: 404, statusMessage: 'Episode not found' })

  const [scraped, episodeNumbers] = await Promise.all([
    refresh ? scrapeEpisodeFresh(resolved.sourceSlug) : scrapeEpisode(resolved.sourceSlug),
    getEpisodeNumbers(resolved.animeSlug),
  ])
  if (!scraped) throw createError({ statusCode: 404, statusMessage: 'Episode unavailable' })

  const defaultCandidate = selectDefaultCandidate(scraped.mirrors)
  let initialSource: { playUrl: string, kind: 'hls' | 'file', quality: string, dataContent: string } | null = null
  if (defaultCandidate && !refresh) {
    try {
      const cached = await peekPreparedResult(defaultCandidate.dataContent)
      if (cached?.ok && cached.playUrl && cached.kind) {
        initialSource = { playUrl: cached.playUrl, kind: cached.kind, quality: defaultCandidate.quality, dataContent: defaultCandidate.dataContent }
      }
    }
    catch {}
  }

  return {
    anime: { malId, title: resolved.anime.title, thumbnail: resolved.anime.thumbnail },
    episodeNumber,
    episode: {
      title: scraped.title || resolved.episodeTitle,
      mirrors: scraped.mirrors,
      thumbnail: scraped.thumbnail || resolved.anime.thumbnail,
    },
    episodes: episodeNumbers,
    initialSource,
  }
})

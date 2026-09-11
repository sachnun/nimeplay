import { createError, getQuery, getRouterParam } from 'h3'
import { getEpisodeNumbers, resolveEpisode } from '../../../../utils/queries'
import { toAbsoluteUrl } from '../../../../utils/r2'
import { prepareMirror, selectDefaultCandidate } from '../../../../utils/prepare'
import { scrapeEpisode } from '../../../../utils/sources'

defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'Watch episode',
    description: 'Resolve an episode to a ready-to-play stream URL. Pick a server with server and quality, defaults to the best server.',
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
        name: 'server',
        in: 'query',
        required: false,
        schema: { type: 'string' },
        description: 'Preferred server name, see servers in the response',
      },
      {
        name: 'quality',
        in: 'query',
        required: false,
        schema: { type: 'string' },
        description: 'Preferred quality, for example 720p',
      },
    ],
    responses: {
      '200': { description: 'Episode with direct stream URL' },
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

  const query = getQuery(event)
  const preferredServer = String(query.server || '').toLowerCase().trim()
  const preferredQuality = String(query.quality || '').trim()

  const resolved = await resolveEpisode(malId, episodeNumber)
  if (!resolved) throw createError({ statusCode: 404, statusMessage: 'Episode not found' })

  const [scraped, episodeNumbers] = await Promise.all([
    scrapeEpisode(resolved.sourceSlug, event),
    getEpisodeNumbers(resolved.animeSlug, event),
  ])
  if (!scraped) throw createError({ statusCode: 404, statusMessage: 'Episode unavailable' })

  const servers = scraped.mirrors.flatMap(mirror =>
    mirror.sources.map(source => ({ server: source.name, quality: mirror.quality })),
  )

  const candidates = scraped.mirrors.flatMap(mirror =>
    mirror.sources.map(source => ({
      dataContent: source.dataContent,
      quality: mirror.quality,
      name: source.name,
    })),
  )

  let ordered = candidates
  const requested = preferredServer || preferredQuality
    ? candidates.find(candidate =>
        (!preferredServer || candidate.name.toLowerCase() === preferredServer)
        && (!preferredQuality || candidate.quality === preferredQuality),
      )
    : null
  if (requested) {
    ordered = [requested, ...candidates.filter(candidate => candidate.dataContent !== requested.dataContent)]
  }
  else {
    const best = selectDefaultCandidate(scraped.mirrors)
    if (best) {
      const match = candidates.find(candidate => candidate.dataContent === best.dataContent)
      if (match) ordered = [match, ...candidates.filter(candidate => candidate.dataContent !== match.dataContent)]
    }
  }

  const origin = getRequestURL(event).origin
  let stream: { playUrl: string, kind: 'hls' | 'file', quality: string, server: string } | null = null
  for (const candidate of ordered.slice(0, 3)) {
    try {
      const result = await prepareMirror(candidate.dataContent, origin, event)
      if (result.ok && result.playUrl && result.kind) {
        stream = { playUrl: result.playUrl, kind: result.kind, quality: candidate.quality, server: candidate.name }
        break
      }
    }
    catch {}
  }

  return {
    anime: { malId, title: resolved.anime.title, thumbnail: toAbsoluteUrl(resolved.anime.thumbnail, event) },
    episodeNumber,
    title: scraped.title || resolved.episodeTitle,
    thumbnail: toAbsoluteUrl(scraped.thumbnail || resolved.anime.thumbnail, event),
    episodes: episodeNumbers,
    servers,
    stream,
  }
})

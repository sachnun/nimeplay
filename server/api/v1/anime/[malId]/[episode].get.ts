import { Effect } from 'effect'
import { defineRouteMeta } from 'nitro'
import { createError, defineEventHandler, getQuery, getRouterParam, type RequestEvent } from 'nuxt/server'

defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'Watch episode',
    description:
      'Resolve an episode to a ready-to-play stream URL. Pick a server with server and quality, defaults to the best server.',
    parameters: [
      {
        name: 'malId',
        in: 'path',
        required: true,
        schema: { type: 'integer' },
        description: 'MyAnimeList ID',
        example: 52991,
      },
      {
        name: 'episode',
        in: 'path',
        required: true,
        schema: { type: 'integer', minimum: 1 },
        description: 'Episode number',
        example: 1,
      },
      {
        name: 'server',
        in: 'query',
        required: false,
        schema: { type: 'string' },
        description: 'Preferred server name, see servers in the response',
        example: 'blogger',
      },
      {
        name: 'quality',
        in: 'query',
        required: false,
        schema: { type: 'string' },
        description: 'Preferred quality, for example 720p',
        example: '720p',
      },
      {
        name: 'stream',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['1', '0'], default: '1' },
        description: 'Set to 0 to skip resolving a playable stream URL',
        example: '1',
      },
    ],
    responses: {
      '200': {
        description: 'Episode with direct stream URL',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/EpisodeResponse' },
            example: {
              anime: {
                malId: 52991,
                title: 'Sousou no Frieren',
                thumbnail: '/media/poster/52991.webp',
              },
              episodeNumber: 1,
              title: 'Sousou no Frieren Episode 1',
              thumbnail: '/media/poster/52991.webp',
              episodes: [1, 2, 3],
              servers: [
                { server: 'blogger', quality: '720p' },
                { server: 'odcloud', quality: '480p' },
              ],
              stream: {
                playUrl: '/api/stream?t=abc123',
                kind: 'hls',
                quality: '720p',
                server: 'blogger',
              },
            },
          },
        },
      },
      '400': { description: 'Invalid MAL id or episode number' },
      '404': { description: 'Episode not found' },
    },
  },
})

interface EpisodeCandidate {
  dataContent: string
  quality: string
  name: string
}

function parseIds(event: RequestEvent): {
  malId: number
  episodeNumber: number
} {
  const malId = Number(getRouterParam(event, 'malId', { decode: true }))
  const episodeNumber = Number(getRouterParam(event, 'episode', { decode: true }))
  if (!Number.isInteger(malId) || malId <= 0 || !Number.isInteger(episodeNumber) || episodeNumber <= 0) {
    throw createError({ status: 400, statusText: 'Invalid MAL id or episode number' })
  }
  return { malId, episodeNumber }
}

function orderCandidates(
  candidates: EpisodeCandidate[],
  mirrors: Parameters<typeof selectDefaultCandidate>[0],
  preferredServer: string,
  preferredQuality: string,
): EpisodeCandidate[] {
  const requested =
    preferredServer || preferredQuality
      ? candidates.find(
          candidate =>
            (!preferredServer || candidate.name.toLowerCase() === preferredServer) &&
            (!preferredQuality || candidate.quality === preferredQuality),
        )
      : undefined
  if (requested) return [requested]
  const best = selectDefaultCandidate(mirrors)
  const match = best && candidates.find(candidate => candidate.dataContent === best.dataContent)
  if (!match) return candidates
  return [match, ...candidates.filter(candidate => candidate.dataContent !== match.dataContent)]
}

function resolveFirstStream(order: EpisodeCandidate[], enabled: boolean) {
  return Effect.gen(function* () {
    if (!enabled) return null
    for (const candidate of order.slice(0, 3)) {
      const result = yield* prepareMirror(candidate.dataContent).pipe(
        Effect.catch(() => Effect.succeed({ playUrl: null, kind: null, ok: false })),
      )
      if (result.ok && result.playUrl && result.kind) {
        return { playUrl: result.playUrl, kind: result.kind, quality: candidate.quality, server: candidate.name }
      }
    }
    return null
  })
}

export default defineEventHandler(async event => {
  const { malId, episodeNumber } = parseIds(event)
  const query = getQuery(event)
  const preferredServer = String(query.server || '')
    .toLowerCase()
    .trim()
  const preferredQuality = String(query.quality || '').trim()
  const resolveStream = !['0', 'false'].includes(String(query.stream ?? '').toLowerCase())

  const resolved = await resolveEpisode(malId, episodeNumber)
  if (!resolved) throw createError({ status: 404, statusText: 'Episode not found' })

  const [scraped, episodeNumbers] = await runApp(
    Effect.all(
      [
        loadEpisodeData(resolved.candidates.map(candidate => candidate.episodeSlug)),
        Effect.promise(() => getEpisodeNumbers(resolved.animeId)),
      ],
      { concurrency: 'unbounded' },
    ),
  )
  if (!scraped) throw createError({ status: 404, statusText: 'Episode unavailable' })

  const servers = scraped.mirrors.flatMap(mirror =>
    mirror.sources.map(source => ({ server: source.name, quality: mirror.quality })),
  )
  const candidates: EpisodeCandidate[] = scraped.mirrors.flatMap(mirror =>
    mirror.sources.map(source => ({
      dataContent: source.dataContent,
      quality: mirror.quality,
      name: source.name,
    })),
  )
  const ordered = orderCandidates(candidates, scraped.mirrors, preferredServer, preferredQuality)
  const stream = await runApp(resolveFirstStream(ordered, resolveStream))

  return {
    anime: { malId, title: resolved.anime.title, thumbnail: resolved.anime.thumbnail },
    episodeNumber,
    title: `${resolved.anime.title} Episode ${episodeNumber}`,
    thumbnail: scraped.thumbnail || resolved.anime.thumbnail,
    episodes: episodeNumbers,
    servers,
    stream,
  }
})

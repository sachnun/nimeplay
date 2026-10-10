import { Effect } from 'effect'
import { error, json } from '@sveltejs/kit'
import { getEpisodeNumbers, resolveEpisode } from '#lib/server/utils/db/queries/episodes'
import { loadEpisodeData } from '#lib/server/utils/db/episode-cache'
import { prepareMirror, selectDefaultCandidate } from '#lib/server/utils/media/prepare'
import { runApp } from '#lib/server/utils/runtime'
import type { RequestHandler } from './$types'

interface EpisodeCandidate {
  dataContent: string
  quality: string
  name: string
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

export const GET: RequestHandler = async ({ params, url }) => {
  const malId = Number(params.malId)
  const episodeNumber = Number(params.episode)
  if (!Number.isInteger(malId) || malId <= 0 || !Number.isInteger(episodeNumber) || episodeNumber <= 0) {
    error(400, 'Invalid MAL id or episode number')
  }

  const preferredServer = (url.searchParams.get('server') || '').toLowerCase().trim()
  const preferredQuality = (url.searchParams.get('quality') || '').trim()
  const resolveStream = !['0', 'false'].includes((url.searchParams.get('stream') ?? '').toLowerCase())

  const resolved = await resolveEpisode(malId, episodeNumber)
  if (!resolved) error(404, 'Episode not found')

  const [scraped, episodeNumbers] = await runApp(
    Effect.all(
      [
        loadEpisodeData(resolved.candidates.map(candidate => candidate.episodeSlug)),
        Effect.promise(() => getEpisodeNumbers(resolved.animeId)),
      ],
      { concurrency: 'unbounded' },
    ),
  )
  if (!scraped) error(404, 'Episode unavailable')

  const servers = scraped.mirrors.flatMap(mirror =>
    mirror.sources.map(source => ({ server: source.name, quality: mirror.quality })),
  )
  const candidates: EpisodeCandidate[] = scraped.mirrors.flatMap(mirror =>
    mirror.sources.map(source => ({ dataContent: source.dataContent, quality: mirror.quality, name: source.name })),
  )
  const ordered = orderCandidates(candidates, scraped.mirrors, preferredServer, preferredQuality)
  const stream = await runApp(resolveFirstStream(ordered, resolveStream))

  return json({
    anime: { malId, title: resolved.anime.title, thumbnail: resolved.anime.thumbnail },
    episodeNumber,
    title: `${resolved.anime.title} Episode ${episodeNumber}`,
    thumbnail: scraped.thumbnail || resolved.anime.thumbnail,
    episodes: episodeNumbers,
    servers,
    stream,
  })
}

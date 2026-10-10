import { Effect } from 'effect'
import { error, json } from '@sveltejs/kit'
import { getEpisodeNumbers, resolveEpisode } from '#lib/server/utils/db/queries/episodes'
import { loadEpisodeData } from '#lib/server/utils/db/episode-cache'
import { resolveStreamFromMirrors } from '#lib/server/utils/media/stream-resolve'
import { runApp } from '#lib/server/utils/runtime'
import type { RequestHandler } from './$types'

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
  const stream = resolveStream
    ? await runApp(resolveStreamFromMirrors(scraped.mirrors, preferredServer, preferredQuality))
    : null

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

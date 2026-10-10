import { error, redirect } from '@sveltejs/kit'
import { getAnimeDetail } from '#lib/server/utils/db/queries/detail'
import { getEpisodeNumbers, resolveEpisode } from '#lib/server/utils/db/queries/episodes'
import { loadEpisodeData } from '#lib/server/utils/db/episode-cache'
import { runApp } from '#lib/server/utils/runtime'
import { Effect } from 'effect'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params }) => {
  const malId = Number(params.malId) || 0
  const episodeNumber = Number(params.episode) || 0
  if (!malId || !episodeNumber) redirect(307, '/')

  const [detail, resolved] = await Promise.all([getAnimeDetail(malId), resolveEpisode(malId, episodeNumber)])
  if (!detail) redirect(307, '/')
  if (!resolved) redirect(307, `/anime/${malId}`)

  const [scraped, episodeNumbers] = await runApp(
    Effect.all(
      [
        loadEpisodeData(resolved.candidates.map(candidate => candidate.episodeSlug)),
        Effect.promise(() => getEpisodeNumbers(resolved.animeId)),
      ],
      { concurrency: 'unbounded' },
    ),
  )
  if (!scraped) error(503, 'Episode unavailable')

  return {
    anime: { malId, title: detail.title, thumbnail: detail.thumbnail },
    episodeNumber,
    episode: {
      title: `${detail.title} Episode ${episodeNumber}`,
      thumbnail: scraped.thumbnail || detail.thumbnail,
      sources: scraped.mirrors.flatMap(mirror =>
        mirror.sources.map(source => ({ server: source.name, quality: mirror.quality })),
      ),
      stream: null,
    },
    episodes: episodeNumbers.length > 0 ? episodeNumbers : detail.episodes.map(entry => entry.number),
  }
}

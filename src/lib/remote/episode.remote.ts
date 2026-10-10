import { Effect } from 'effect'
import { error, redirect } from '@sveltejs/kit'
import { query } from '$app/server'
import type { EpisodeInfo, EpisodeStream } from '#lib/types'
import { episodeInfoSchema, episodeStreamSchema } from '#lib/schemas'
import { getEpisodeNumbers, resolveEpisode } from '#lib/server/utils/db/queries/episodes'
import { loadEpisodeData } from '#lib/server/utils/db/episode-cache'
import { resolveStreamFromMirrors } from '#lib/server/utils/media/stream-resolve'
import { runApp } from '#lib/server/utils/runtime'

export const loadEpisodeInfo = query(
  episodeInfoSchema,
  async ({ malId, episodeNumber }): Promise<EpisodeInfo> => {
    const resolved = await resolveEpisode(malId, episodeNumber)
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
      anime: { malId, title: resolved.anime.title, thumbnail: resolved.anime.thumbnail },
      episodeNumber,
      episode: {
        title: `${resolved.anime.title} Episode ${episodeNumber}`,
        thumbnail: scraped.thumbnail || resolved.anime.thumbnail,
        sources: scraped.mirrors.flatMap(mirror =>
          mirror.sources.map(source => ({ server: source.name, quality: mirror.quality })),
        ),
      },
      episodes: episodeNumbers.length > 0 ? episodeNumbers : [],
    }
  },
)

export const loadEpisodeStream = query(
  episodeStreamSchema,
  async ({ malId, episodeNumber, server, quality }): Promise<EpisodeStream | null> => {
    const resolved = await resolveEpisode(malId, episodeNumber)
    if (!resolved) return null

    const scraped = await runApp(loadEpisodeData(resolved.candidates.map(candidate => candidate.episodeSlug)))
    if (!scraped) return null

    return runApp(
      resolveStreamFromMirrors(scraped.mirrors, (server || '').toLowerCase().trim(), (quality || '').trim()),
    )
  },
)

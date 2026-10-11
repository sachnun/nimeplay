import { Effect } from 'effect'
import { error, redirect } from '@sveltejs/kit'
import { query } from '$app/server'
import type { EpisodeInfo, EpisodeStream } from '#lib/types'
import { episodeInfoSchema, episodeStreamSchema } from '#lib/schemas'
import { getEpisodeNumbers, resolveEpisode } from '#lib/server/utils/db/queries/episodes'
import { loadEpisodeData } from '#lib/server/utils/db/episode-cache'
import { resolveStreamFromMirrors } from '#lib/server/utils/media/stream-resolve'
import { loadSourceScores, type SourceScores } from '#lib/server/utils/media/scores'
import { runApp } from '#lib/server/utils/runtime'

function withScores<T extends { server: string; quality: string }>(sources: T[], scores: SourceScores) {
  return sources.map(source => ({ ...source, score: scores.scoreOf(source.server, source.quality) }))
}

export const loadEpisodeHeader = query(
  episodeInfoSchema,
  async ({ malId, episodeNumber }): Promise<EpisodeInfo> => {
    const resolved = await resolveEpisode(malId, episodeNumber)
    if (!resolved) redirect(307, `/anime/${malId}`)

    const episodeNumbers = await getEpisodeNumbers(resolved.animeId)

    return {
      anime: { malId, title: resolved.anime.title, thumbnail: resolved.anime.thumbnail },
      episodeNumber,
      episode: {
        title: `${resolved.anime.title} Episode ${episodeNumber}`,
        thumbnail: resolved.anime.thumbnail,
        sources: [],
      },
      episodes: episodeNumbers.length > 0 ? episodeNumbers : [],
    }
  },
)

export const loadEpisodeInfo = query(
  episodeInfoSchema,
  async ({ malId, episodeNumber }): Promise<EpisodeInfo> => {
    const resolved = await resolveEpisode(malId, episodeNumber)
    if (!resolved) redirect(307, `/anime/${malId}`)

    const [scraped, episodeNumbers, scores] = await runApp(
      Effect.all(
        [
          loadEpisodeData(resolved.candidates.map(candidate => candidate.episodeSlug)),
          Effect.promise(() => getEpisodeNumbers(resolved.animeId)),
          loadSourceScores,
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
        sources: withScores(
          scraped.mirrors.flatMap(mirror =>
            mirror.sources.map(source => ({ server: source.name, quality: mirror.quality })),
          ),
          scores,
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

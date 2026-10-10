import { Effect } from 'effect'
import { error, redirect } from '@sveltejs/kit'
import { query } from '$app/server'
import type { EpisodePageData, EpisodeStream } from '#lib/types'
import { episodeSchema } from '#lib/schemas'
import { getEpisodeNumbers, resolveEpisode } from '#lib/server/utils/db/queries/episodes'
import { loadEpisodeData } from '#lib/server/utils/db/episode-cache'
import { orderCandidates } from '#lib/server/utils/media/candidates'
import { prepareMirror } from '#lib/server/utils/media/prepare'
import { runApp } from '#lib/server/utils/runtime'

function resolveFirstStream(order: ReturnType<typeof orderCandidates>, enabled: boolean) {
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

export const loadEpisode = query(episodeSchema, async ({ malId, episodeNumber, server, quality, stream }): Promise<EpisodePageData> => {
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

  const sources = scraped.mirrors.flatMap(mirror =>
    mirror.sources.map(source => ({ server: source.name, quality: mirror.quality })),
  )
  const candidates = scraped.mirrors.flatMap(mirror =>
    mirror.sources.map(source => ({ dataContent: source.dataContent, quality: mirror.quality, name: source.name })),
  )
  const ordered = orderCandidates(candidates, scraped.mirrors, (server || '').toLowerCase().trim(), (quality || '').trim())
  const picked = await runApp(resolveFirstStream(ordered, stream))

  return {
    anime: { malId, title: resolved.anime.title, thumbnail: resolved.anime.thumbnail },
    episodeNumber,
    episode: {
      title: `${resolved.anime.title} Episode ${episodeNumber}`,
      thumbnail: scraped.thumbnail || resolved.anime.thumbnail,
      sources,
      stream: picked as EpisodeStream | null,
    },
    episodes: episodeNumbers.length > 0 ? episodeNumbers : [],
  }
})

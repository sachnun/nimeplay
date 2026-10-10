import { Effect } from 'effect'
import type { EpisodeStream } from '#lib/types'
import type { Http } from '../net/http'
import { orderCandidates } from './candidates'
import { prepareMirror } from './prepare'

interface MirrorSource {
  name: string
  dataContent: string
}

interface MirrorGroup {
  quality: string
  sources: MirrorSource[]
}

export function resolveStreamFromMirrors(
  mirrors: MirrorGroup[],
  preferredServer: string,
  preferredQuality: string,
  limit = 3,
): Effect.Effect<EpisodeStream | null, never, Http> {
  return Effect.gen(function* () {
    const candidates = mirrors.flatMap(mirror =>
      mirror.sources.map(source => ({ dataContent: source.dataContent, quality: mirror.quality, name: source.name })),
    )
    const ordered = orderCandidates(candidates, mirrors, preferredServer, preferredQuality)
    for (const candidate of ordered.slice(0, limit)) {
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

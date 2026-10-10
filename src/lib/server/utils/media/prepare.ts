import { Effect } from 'effect'
import { qualityRank, sourcePriority } from '#lib/shared/utils/mirror'
import { extractStreamUrl, probeStream } from '../extractors'
import { isPlaceholderStreamUrl } from '../extractors/hosts'
import { megaKeyFromUrl } from './mega'
import { openStreamToken, proxiedStreamPath, sealStreamToken } from './stream'
import { splitSource, resolvemirror } from '../sources'
import type { Http } from '../net/http'
import type { NetError } from '../net/rate'

interface PrepareResult {
  playUrl: string | null
  kind: 'hls' | 'file' | null
  ok: boolean
}

interface MirrorSource {
  name: string
  dataContent: string
}

interface MirrorGroup {
  quality: string
  sources: MirrorSource[]
}

interface DefaultMirrorCandidate {
  dataContent: string
  quality: string
  name: string
}

function emptyPrepareResult(): PrepareResult {
  return { playUrl: null, kind: null, ok: false }
}

export function selectDefaultCandidate(mirrors: MirrorGroup[]): DefaultMirrorCandidate | null {
  const sorted = mirrors.toSorted((a, b) => qualityRank(a.quality) - qualityRank(b.quality))
  const startIdx = sorted.findIndex(m => m.quality === '720p')
  const ordered = startIdx > 0 ? [...sorted.slice(startIdx), ...sorted.slice(0, startIdx)] : sorted
  for (const mirror of ordered) {
    const best = mirror.sources.toSorted((a, b) => sourcePriority(a.name) - sourcePriority(b.name))[0]
    if (best) return { dataContent: best.dataContent, quality: mirror.quality, name: best.name }
  }
  return null
}

export function prepareMirror(dataContent: string): Effect.Effect<PrepareResult, NetError, Http> {
  return Effect.gen(function* () {
    const mirrorId = yield* Effect.promise(() => openStreamToken(dataContent))
    if (!mirrorId || isPlaceholderStreamUrl(mirrorId)) return emptyPrepareResult()
    const embedUrl = yield* resolvemirror(mirrorId)
    if (!embedUrl || isPlaceholderStreamUrl(embedUrl)) return emptyPrepareResult()
    const directUrl = yield* Effect.promise(() => extractStreamUrl(embedUrl))
    if (!directUrl || isPlaceholderStreamUrl(directUrl)) return emptyPrepareResult()
    const source = splitSource(mirrorId)?.source
    const hint = source?.proxy ? yield* source.proxy(directUrl).pipe(Effect.catch(() => Effect.succeed(null))) : null
    const hintHeaders = hint?.headers && Object.keys(hint.headers).length > 0 ? hint.headers : undefined
    const megaKey = megaKeyFromUrl(directUrl)
    if (megaKey) {
      const token = yield* Effect.promise(() =>
        sealStreamToken(directUrl.slice(0, directUrl.indexOf('#')), undefined, hintHeaders, megaKey),
      )
      return { playUrl: proxiedStreamPath(token), kind: 'file', ok: true }
    }
    const probe = yield* Effect.promise(() => probeStream(directUrl, hintHeaders))
    const token = yield* Effect.promise(() => sealStreamToken(directUrl, undefined, hintHeaders))
    return { playUrl: proxiedStreamPath(token), kind: probe.kind, ok: true }
  })
}

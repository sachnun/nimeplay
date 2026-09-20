import { qualityRank, sourcePriority } from '#shared/mirror'
import { isPlaceholderStreamUrl } from './extractors/hosts'

export interface PrepareResult {
  playUrl: string | null
  kind: 'hls' | 'file' | null
  ok: boolean
}

export interface MirrorSource {
  name: string
  dataContent: string
}

export interface MirrorGroup {
  quality: string
  sources: MirrorSource[]
}

export interface DefaultMirrorCandidate {
  dataContent: string
  quality: string
  name: string
}

export function emptyPrepareResult(): PrepareResult {
  return { playUrl: null, kind: null, ok: false }
}

export function selectDefaultCandidate(mirrors: MirrorGroup[]): DefaultMirrorCandidate | null {
  const sorted = [...mirrors].sort((a, b) => qualityRank(a.quality) - qualityRank(b.quality))
  const startIdx = sorted.findIndex(m => m.quality === '720p')
  const ordered = startIdx > 0 ? [...sorted.slice(startIdx), ...sorted.slice(0, startIdx)] : sorted
  for (const mirror of ordered) {
    const best = [...mirror.sources].sort((a, b) => sourcePriority(a.name) - sourcePriority(b.name))[0]
    if (best) return { dataContent: best.dataContent, quality: mirror.quality, name: best.name }
  }
  return null
}

export async function prepareMirror(dataContent: string, origin: string): Promise<PrepareResult> {
  const mirrorId = await openStreamToken(dataContent)
  if (!mirrorId || isPlaceholderStreamUrl(mirrorId)) return emptyPrepareResult()
  const embedUrl = await resolvemirror(mirrorId)
  if (!embedUrl || isPlaceholderStreamUrl(embedUrl)) return emptyPrepareResult()
  const directUrl = await extractStreamUrl(embedUrl)
  if (!directUrl || isPlaceholderStreamUrl(directUrl)) return emptyPrepareResult()
  const kind = await detectStreamKind(directUrl)
  const source = splitSource(mirrorId)?.source
  const hint = source?.proxy ? await source.proxy(directUrl).catch(() => null) : null
  const token = await sealStreamToken(directUrl, undefined, hint?.headers)
  return { playUrl: proxiedStreamPath(origin, token), kind, ok: true }
}

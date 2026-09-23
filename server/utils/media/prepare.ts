import { qualityRank, sourcePriority } from '#shared/mirror'
import { isPlaceholderStreamUrl } from '../extractors/hosts'

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
  const source = splitSource(mirrorId)?.source
  const hint = source?.proxy ? await source.proxy(directUrl).catch(() => null) : null
  const hintHeaders = hint?.headers && Object.keys(hint.headers).length > 0 ? hint.headers : undefined
  const megaKey = megaKeyFromUrl(directUrl)
  if (megaKey) {
    const token = await sealStreamToken(directUrl.slice(0, directUrl.indexOf('#')), undefined, hintHeaders, megaKey)
    return { playUrl: proxiedStreamPath(origin, token), kind: 'file', ok: true }
  }
  const probe = await probeStream(directUrl, hintHeaders)
  if (!probe.ok && !hintHeaders) return { playUrl: directUrl, kind: probe.kind, ok: true }
  const token = await sealStreamToken(directUrl, undefined, hintHeaders)
  return { playUrl: proxiedStreamPath(origin, token), kind: probe.kind, ok: true }
}

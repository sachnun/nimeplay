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

export const MIRROR_PREPARE_TTL = 60 * 60 * 1000

const SOURCE_PRIORITY_GROUPS = [
  ['animeverse', 'nekoclouds'],
  ['puterin', 'putarin'],
  ['pixeldrain', 'pdrain', 'odcdn', 'odstream', 'odcloud', 'arcg', 'archive'],
  ['vidhide', 'filelions'],
  ['ondesuhd', 'desudesuhd', 'otakustream', 'moedesuhd'],
  ['desudrive'],
  ['moeplay', 'yourupload', 'yuplod', 'mp4upload', 'mp4load'],
  ['filedon'],
]

const QUALITY_ORDER = ['1080p', '720p', '480p', '360p']

export function emptyPrepareResult(): PrepareResult {
  return { playUrl: null, kind: null, ok: false }
}

function sourcePriority(name: string): number {
  const normalized = name.toLowerCase().trim()
  const groupIndex = SOURCE_PRIORITY_GROUPS.findIndex(group => group.some(source => normalized.includes(source)))
  return groupIndex === -1 ? SOURCE_PRIORITY_GROUPS.length : groupIndex
}

function qualityRank(quality: string): number {
  const index = QUALITY_ORDER.indexOf(quality)
  return index === -1 ? 99 : index
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

export function prepareMirror(dataContent: string, origin: string): Promise<PrepareResult> {
  return cache.get('prepare', dataContent, MIRROR_PREPARE_TTL, async (): Promise<PrepareResult> => {
    const mirrorId = await openStreamToken(dataContent)
    if (!mirrorId || isPlaceholderStreamUrl(mirrorId)) return emptyPrepareResult()
    const embedUrl = await resolvemirror(mirrorId)
    if (!embedUrl || isPlaceholderStreamUrl(embedUrl)) return emptyPrepareResult()
    const directUrl = await extractStreamUrl(embedUrl)
    if (!directUrl || isPlaceholderStreamUrl(directUrl)) return emptyPrepareResult()
    const kind = await detectStreamKind(directUrl)
    const token = await sealStreamToken(directUrl)
    return { playUrl: proxiedStreamPath(origin, token), kind, ok: true }
  }) as Promise<PrepareResult>
}

export function peekPreparedResult(dataContent: string): Promise<PrepareResult> | undefined {
  return cache.peek('prepare', dataContent) as Promise<PrepareResult> | undefined
}

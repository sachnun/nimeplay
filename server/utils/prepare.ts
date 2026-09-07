import { cache } from './cache'
import { detectStreamKind, extractStreamUrl, probeIframeUrl } from './extractors'
import { resolvemirror } from './sources'
import { openStreamToken, proxiedStreamPath, sealStreamToken } from './streamUrl'

export type PrepareResult = {
  iframeUrl: string | null
  playUrl: string | null
  kind: 'hls' | 'file' | null
  ok: boolean
}

export type MirrorInput = {
  quality: string
  sources: { name: string; dataContent: string }[]
}

export type MirrorCandidateInput = {
  dataContent: string
  quality: string
  name: string
}

export type InitialStream = {
  dataContent: string
  quality: string
  name: string
  iframeUrl: string | null
  playUrl: string | null
  kind: 'hls' | 'file' | null
  ok: boolean
}

export const MIRROR_PREPARE_TTL = 10 * 60 * 1000
const INITIAL_PREPARE_TIMEOUT_MS = 4500

const EXTRACTABLE = [
  'vidhide',
  'ondesuhd',
  'desudesuhd',
  'otakustream',
  'moedesuhd',
  'desudrive',
  'ondesu3',
  'updesu',
  'playdesu',
  'otakuplay',
  'moedesu',
  'otakuwatch',
  'odstream',
  'filedon',
  'animeverse',
  'pixeldrain',
]

const SOURCE_PRIORITY_GROUPS = [
  ['vidhide'],
  ['ondesuhd', 'desudesuhd', 'otakustream', 'moedesuhd'],
  ['desudrive'],
]

const QUALITY_ORDER = ['2160p', '1440p', '1080p', '720p', '480p', '360p']

function normalizeName(name: string): string {
  return name.toLowerCase().trim()
}

function matchesGroup(name: string, sources: string[]): boolean {
  return sources.some((source) => name.includes(source))
}

function isExtractableName(name: string): boolean {
  return matchesGroup(name, EXTRACTABLE)
}

export function isExtractableSource(name: string): boolean {
  return isExtractableName(normalizeName(name))
}

function qualityRank(quality: string): number {
  const index = QUALITY_ORDER.indexOf(quality)
  return index === -1 ? 99 : index
}

function sourcePriority(name: string): number {
  const normalized = normalizeName(name)
  const groupIndex = SOURCE_PRIORITY_GROUPS.findIndex((group) => matchesGroup(normalized, group))
  if (groupIndex !== -1) return groupIndex
  return isExtractableName(normalized) ? SOURCE_PRIORITY_GROUPS.length : SOURCE_PRIORITY_GROUPS.length + 1
}

function rankCandidates(mirrors: MirrorInput[], startQuality: string, excludeName?: string): MirrorCandidateInput[] {
  const excluded = excludeName ? normalizeName(excludeName) : null
  const sorted = [...mirrors].sort((a, b) => qualityRank(a.quality) - qualityRank(b.quality))
  const startIdx = sorted.findIndex((m) => m.quality === startQuality)
  const ordered = startIdx > 0 ? [...sorted.slice(startIdx), ...sorted.slice(0, startIdx)] : sorted
  const groups = { extractable: [] as MirrorCandidateInput[], fallback: [] as MirrorCandidateInput[] }
  for (const mirror of ordered) {
    const sources = [...mirror.sources].sort((a, b) => sourcePriority(a.name) - sourcePriority(b.name))
    for (const source of sources) {
      const normalized = normalizeName(source.name)
      if (excluded && normalized === excluded) continue
      const candidate = { dataContent: source.dataContent, quality: mirror.quality, name: source.name }
      if (isExtractableName(normalized)) groups.extractable.push(candidate)
      else groups.fallback.push(candidate)
    }
  }
  return [...groups.extractable, ...groups.fallback]
}

export function pickDefaultCandidate(mirrors: MirrorInput[]): MirrorCandidateInput | null {
  return rankCandidates(mirrors, '720p')[0] ?? null
}

export function emptyPrepareResult(iframeUrl: string | null = null): PrepareResult {
  return { iframeUrl, playUrl: null, kind: null, ok: false }
}

function isHlsUrl(url: string): boolean {
  return /\.m3u8($|\?)/i.test(url) || /\/hls\//i.test(url)
}

function isFileUrl(url: string): boolean {
  return /\.(mp4|mkv|webm)(\?|$)/i.test(url)
}

async function detectKindFast(url: string): Promise<'hls' | 'file'> {
  if (isHlsUrl(url)) return 'hls'
  if (isFileUrl(url)) return 'file'
  const detected = await detectStreamKind(url)
  return detected
}

export function prepareMirror(dataContent: string, extract: boolean): Promise<PrepareResult> {
  return cache.get('prepare', `v2:${extract}:${dataContent}`, MIRROR_PREPARE_TTL, async (): Promise<PrepareResult> => {
    const mirrorId = await openStreamToken(dataContent)
    if (!mirrorId) return emptyPrepareResult()
    const iframeUrl = await resolvemirror(mirrorId)
    if (!iframeUrl) return emptyPrepareResult()
    if (!extract) return { ...emptyPrepareResult(iframeUrl), ok: await probeIframeUrl(iframeUrl) }

    const extracted = await extractStreamUrl(iframeUrl)
    if (!extracted.url) return emptyPrepareResult(extracted.iframeUrl)

    const kind = await detectKindFast(extracted.url)
    const token = await sealStreamToken(extracted.url)
    return { iframeUrl: extracted.iframeUrl, playUrl: proxiedStreamPath(token), kind, ok: true }
  }) as Promise<PrepareResult>
}

export async function prepareInitialStream(mirrors: MirrorInput[]): Promise<InitialStream | null> {
  const ranked = rankCandidates(mirrors, '720p')
  const first = ranked[0]
  if (!first) return null
  const second = rankCandidates(mirrors, '720p', first.name)[0]
  const candidates = second ? [first, second] : [first]
  return new Promise<InitialStream | null>((resolve) => {
    let pending = candidates.length
    let done = false
    const timer = setTimeout(() => {
      if (!done) {
        done = true
        resolve(null)
      }
    }, INITIAL_PREPARE_TIMEOUT_MS)
    for (const candidate of candidates) {
      prepareMirror(candidate.dataContent, isExtractableSource(candidate.name)).then((result) => {
        if (done) return
        if (result?.ok && result.playUrl) {
          done = true
          clearTimeout(timer)
          resolve({
            dataContent: candidate.dataContent,
            quality: candidate.quality,
            name: candidate.name,
            iframeUrl: result.iframeUrl,
            playUrl: result.playUrl,
            kind: result.kind,
            ok: true as const,
          })
        } else {
          pending -= 1
          if (pending <= 0) {
            done = true
            clearTimeout(timer)
            resolve(null)
          }
        }
      }).catch(() => {
        if (done) return
        pending -= 1
        if (pending <= 0) {
          done = true
          clearTimeout(timer)
          resolve(null)
        }
      })
    }
  })
}

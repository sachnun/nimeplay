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

const QUALITY_ORDER = ['1080p', '720p', '480p', '360p']

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

function isKnownHlsIframe(iframeUrl: string): boolean {
  const lower = iframeUrl.toLowerCase()
  return lower.includes('vidhide') || lower.includes('odvidhide')
}

async function detectKindFast(url: string, iframeUrl: string): Promise<'hls' | 'file'> {
  if (isHlsUrl(url)) return 'hls'
  if (isKnownHlsIframe(iframeUrl)) return 'hls'
  const detected = await detectStreamKind(url)
  return detected
}

export function prepareMirror(dataContent: string, extract: boolean, origin: string): Promise<PrepareResult> {
  return cache.get('prepare', `${extract}:${dataContent}`, MIRROR_PREPARE_TTL, async (): Promise<PrepareResult> => {
    const mirrorId = await openStreamToken(dataContent)
    if (!mirrorId) return emptyPrepareResult()
    const iframeUrl = await resolvemirror(mirrorId)
    if (!iframeUrl) return emptyPrepareResult()
    if (!extract) return { ...emptyPrepareResult(iframeUrl), ok: await probeIframeUrl(iframeUrl) }

    const extracted = await extractStreamUrl(iframeUrl)
    if (!extracted.url) return emptyPrepareResult(extracted.iframeUrl)

    const kind = await detectKindFast(extracted.url, extracted.iframeUrl)
    const token = await sealStreamToken(extracted.url)
    return { iframeUrl: extracted.iframeUrl, playUrl: proxiedStreamPath(origin, token), kind, ok: true }
  }) as Promise<PrepareResult>
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export async function prepareInitialStream(mirrors: MirrorInput[], origin: string): Promise<InitialStream | null> {
  const candidates = rankCandidates(mirrors, '720p').slice(0, 2)
  if (candidates.length === 0) return null
  const attempts = candidates.map(async (candidate) => {
    try {
      const result = await prepareMirror(candidate.dataContent, isExtractableSource(candidate.name), origin)
      if (result?.ok && result.playUrl) {
        return {
          dataContent: candidate.dataContent,
          quality: candidate.quality,
          name: candidate.name,
          iframeUrl: result.iframeUrl,
          playUrl: result.playUrl,
          kind: result.kind,
          ok: true as const,
        }
      }
    } catch {}
    return null
  })
  const results = await withTimeout(Promise.all(attempts), INITIAL_PREPARE_TIMEOUT_MS, null)
  if (!results) return null
  return results.find((entry) => entry !== null) ?? null
}

import type { EpisodeData, EpisodeSource } from '~/types'

export type MirrorCandidate = {
  server: string
  quality: string
}

const QUALITY_BITRATE: Record<string, number> = {
  '1080p': 5_000_000,
  '720p': 2_800_000,
  '480p': 1_400_000,
  '360p': 700_000,
}

export function qualityBitrate(quality: string): number {
  const known = QUALITY_BITRATE[quality]
  if (known) return known
  const height = Number.parseInt(quality, 10)
  return Number.isFinite(height) ? height * 4_000 : 2_800_000
}

export function hasFiniteDuration(video: HTMLVideoElement | null | undefined) {
  return Boolean(video?.duration && Number.isFinite(video.duration))
}

function sortSources(sources: EpisodeSource[]): EpisodeSource[] {
  return sources.toSorted(
    (a, b) => qualityRank(a.quality) - qualityRank(b.quality) || sourcePriority(a.server) - sourcePriority(b.server),
  )
}

function toCandidates(sources: EpisodeSource[]): MirrorCandidate[] {
  const seen = new Set<string>()
  const candidates: MirrorCandidate[] = []
  for (const source of sources) {
    const key = `${source.quality}\u0000${source.server}`
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({ server: source.server, quality: source.quality })
  }
  return candidates
}

function reorderSources(sources: EpisodeSource[], startQuality: string) {
  const sorted = sortSources(sources)
  const startIdx = sorted.findIndex(source => source.quality === startQuality)
  return startIdx > 0 ? [...sorted.slice(startIdx), ...sorted.slice(0, startIdx)] : sorted
}

export function buildFallbackOrder(
  sources: EpisodeSource[],
  startQuality: string,
  exclude?: MirrorCandidate,
): MirrorCandidate[] {
  return toCandidates(reorderSources(sources, startQuality)).filter(
    candidate => !exclude || candidate.server !== exclude.server || candidate.quality !== exclude.quality,
  )
}

export function findDefaultMirror(episode: EpisodeData): MirrorCandidate | null {
  return buildFallbackOrder(episode.sources, '720p')[0] ?? null
}

export function listQualityLevels(sources: EpisodeSource[]): MirrorCandidate[] {
  const seen = new Set<string>()
  const levels: MirrorCandidate[] = []
  for (const candidate of toCandidates(sortSources(sources))) {
    if (seen.has(candidate.quality)) continue
    seen.add(candidate.quality)
    levels.push(candidate)
  }
  return levels
}

export function bufferedEndAt(video: HTMLVideoElement): number {
  const ranges = video.buffered
  const time = video.currentTime
  let end = 0
  for (let i = 0; i < ranges.length; i++) {
    if (ranges.start(i) > time) break
    end = ranges.end(i)
  }
  return Math.max(end, time)
}

export function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const ms = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(sec).padStart(2, '0')
  if (h === 0) return `${m}:${ss}`
  return `${h}:${ms}:${ss}`
}

import type { EpisodeData } from './types'

export type MirrorCandidate = {
  dataContent: string
  quality: string
  name: string
}

const SOURCE_PRIORITY_GROUPS = [
  ['animeverse'],
  ['pixeldrain'],
  ['vidhide'],
  ['ondesuhd', 'desudesuhd', 'otakustream', 'moedesuhd'],
  ['desudrive'],
  ['moeplay', 'yourupload', 'yuplod'],
  ['filedon'],
]

const QUALITY_ORDER = ['1080p', '720p', '480p', '360p']

function normalizeSourceName(name: string): string {
  return name.toLowerCase().trim()
}

function matchesSourceGroup(name: string, sources: string[]): boolean {
  return sources.some((source) => name.includes(source))
}

function qualityRank(quality: string): number {
  const index = QUALITY_ORDER.indexOf(quality)
  return index === -1 ? 99 : index
}

function sortedSources(mirror: EpisodeData['mirrors'][number]) {
  return [...mirror.sources].sort((a, b) => sourcePriority(a.name) - sourcePriority(b.name))
}

function toCandidate(quality: string, source: { dataContent: string; name: string }): MirrorCandidate {
  return { dataContent: source.dataContent, quality, name: source.name }
}

function reorderMirrors(mirrors: EpisodeData['mirrors'], startQuality: string) {
  const sorted = [...mirrors].sort((a, b) => qualityRank(a.quality) - qualityRank(b.quality))
  const startIdx = sorted.findIndex((m) => m.quality === startQuality)
  return startIdx > 0 ? [...sorted.slice(startIdx), ...sorted.slice(0, startIdx)] : sorted
}

export function sourcePriority(name: string): number {
  const normalized = normalizeSourceName(name)
  const groupIndex = SOURCE_PRIORITY_GROUPS.findIndex((group) => matchesSourceGroup(normalized, group))
  if (groupIndex !== -1) return groupIndex
  return SOURCE_PRIORITY_GROUPS.length
}

export function buildFallbackOrder(mirrors: EpisodeData['mirrors'], startQuality: string, excludeDataContent?: string): MirrorCandidate[] {
  const candidates: MirrorCandidate[] = []
  for (const mirror of reorderMirrors(mirrors, startQuality)) {
    for (const source of sortedSources(mirror)) {
      if (excludeDataContent && source.dataContent === excludeDataContent) continue
      candidates.push(toCandidate(mirror.quality, source))
    }
  }
  return candidates
}

export function findDefaultMirror(episode: EpisodeData): MirrorCandidate | null {
  const order = buildFallbackOrder(episode.mirrors, '720p')
  return order[0] ?? null
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

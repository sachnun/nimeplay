import type { EpisodeData } from './types'

export type MirrorCandidate = {
  dataContent: string
  quality: string
  name: string
}

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
]

const SOURCE_PRIORITY_GROUPS = [
  ['vidhide'],
  ['ondesuhd', 'desudesuhd', 'otakustream', 'moedesuhd'],
  ['desudrive'],
]

const QUALITY_ORDER = ['1080p', '720p', '480p', '360p']

function normalizeSourceName(name: string): string {
  return name.toLowerCase().trim()
}

function matchesSourceGroup(name: string, sources: string[]): boolean {
  return sources.some((source) => name.includes(source))
}

function isExtractableName(name: string): boolean {
  return matchesSourceGroup(name, EXTRACTABLE)
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

function addCandidate(groups: { extractable: MirrorCandidate[]; fallback: MirrorCandidate[] }, candidate: MirrorCandidate) {
  ;(isExtractableName(normalizeSourceName(candidate.name)) ? groups.extractable : groups.fallback).push(candidate)
}

export function sourcePriority(name: string): number {
  const normalized = normalizeSourceName(name)
  const groupIndex = SOURCE_PRIORITY_GROUPS.findIndex((group) => matchesSourceGroup(normalized, group))
  if (groupIndex !== -1) return groupIndex
  return isExtractableName(normalized) ? SOURCE_PRIORITY_GROUPS.length : SOURCE_PRIORITY_GROUPS.length + 1
}

export function isExtractable(name: string): boolean {
  return isExtractableName(normalizeSourceName(name))
}

export function buildFallbackOrder(mirrors: EpisodeData['mirrors'], startQuality: string, excludeName?: string): MirrorCandidate[] {
  const groups = { extractable: [] as MirrorCandidate[], fallback: [] as MirrorCandidate[] }
  const excluded = excludeName ? normalizeSourceName(excludeName) : null
  for (const mirror of reorderMirrors(mirrors, startQuality)) {
    for (const source of sortedSources(mirror)) {
      const normalized = normalizeSourceName(source.name)
      if (excluded && normalized === excluded) continue
      addCandidate(groups, toCandidate(mirror.quality, source))
    }
  }
  return [...groups.extractable, ...groups.fallback]
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


import type { EpisodeData } from './types'
import { qualityRank, sourcePriority } from '#shared/mirror'

export { sourcePriority }

export type MirrorCandidate = {
  dataContent: string
  quality: string
  name: string
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

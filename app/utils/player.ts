import type { EpisodeData } from './types'
import { STREAM_API_URL } from './api'

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

export class ProxyPlaylistLoader {
  private controller: AbortController | null = null

  destroy() { this.abort() }

  abort() {
    this.controller?.abort()
    this.controller = null
  }

  load(context: { url: string }, _config: unknown, callbacks: { onSuccess: (...args: unknown[]) => void; onError: (...args: unknown[]) => void }) {
    this.controller = new AbortController()
    const start = performance.now()
    fetch(`${STREAM_API_URL}?url=${encodeURIComponent(context.url)}`, { signal: this.controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Stream proxy failed: ${res.status}`)
        return res.text()
      })
      .then((body) => {
        const end = performance.now()
        const stats = {
          aborted: false,
          loaded: body.length,
          retry: 0,
          total: body.length,
          chunkCount: 1,
          bwEstimate: 0,
          loading: { start, first: end, end },
          parsing: { start: end, end },
          buffering: { start: end, first: end, end },
        }
        callbacks.onSuccess({ url: context.url, data: body }, stats, context, null)
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return
        const stats = {
          aborted: false,
          loaded: 0,
          retry: 0,
          total: 0,
          chunkCount: 0,
          bwEstimate: 0,
          loading: { start, first: 0, end: 0 },
          parsing: { start: 0, end: 0 },
          buffering: { start: 0, first: 0, end: 0 },
        }
        callbacks.onError({ code: 0, text: err.message }, context, null, stats)
      })
  }
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

export function getEpNum(nav: { title: string; slug: string }[], slug: string): string {
  const ascending = [...nav].reverse()
  const idx = ascending.findIndex((ep) => ep.slug === slug)
  if (idx === -1) return '1'
  return ascending[idx]?.title.match(/episode\s*(\d+)/i)?.[1] ?? `${idx + 1}`
}

export function extractEpisodeNumber(slug: string): number | null {
  const match = slug.match(/episode-(\d+)/i)
  return match?.[1] ? Number.parseInt(match[1]) : null
}

export function episodeNumFor(ep: { title: string }, index: number) {
  return ep.title.match(/episode\s*(\d+)/i)?.[1] ?? `${index + 1}`
}

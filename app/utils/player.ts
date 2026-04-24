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

const QUALITY_ORDER = ['1080p', '720p', '480p', '360p']

export class CorsPlaylistLoader {
  private controller: AbortController | null = null

  destroy() { this.abort() }

  abort() {
    this.controller?.abort()
    this.controller = null
  }

  load(context: { url: string }, _config: unknown, callbacks: { onSuccess: (...args: unknown[]) => void; onError: (...args: unknown[]) => void }) {
    this.controller = new AbortController()
    const start = performance.now()
    fetch(`/api/player/playlist?url=${encodeURIComponent(context.url)}`, { signal: this.controller.signal })
      .then((res) => res.text())
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

function sourcePriority(name: string): number {
  const n = name.toLowerCase().trim()
  if (n.includes('vidhide')) return 0
  if (n.includes('ondesuhd') || n.includes('desudesuhd') || n.includes('otakustream') || n.includes('moedesuhd')) return 1
  if (n.includes('desudrive')) return 2
  if (EXTRACTABLE.some((e) => n.includes(e))) return 3
  return 4
}

export function isExtractable(name: string): boolean {
  const n = name.toLowerCase().trim()
  return EXTRACTABLE.some((e) => n.includes(e))
}

export function buildFallbackOrder(mirrors: EpisodeData['mirrors'], startQuality: string, excludeName?: string): MirrorCandidate[] {
  const sorted = [...mirrors].sort((a, b) => {
    const ai = QUALITY_ORDER.indexOf(a.quality)
    const bi = QUALITY_ORDER.indexOf(b.quality)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
  const startIdx = sorted.findIndex((m) => m.quality === startQuality)
  const reordered = startIdx > 0 ? [...sorted.slice(startIdx), ...sorted.slice(0, startIdx)] : sorted
  const candidates: MirrorCandidate[] = []
  for (const mirror of reordered) {
    const sources = [...mirror.sources].sort((a, b) => sourcePriority(a.name) - sourcePriority(b.name))
    for (const source of sources) {
      if (excludeName && source.name.toLowerCase().trim() === excludeName.toLowerCase().trim()) continue
      candidates.push({ dataContent: source.dataContent, quality: mirror.quality, name: source.name })
    }
  }
  return [
    ...candidates.filter((c) => isExtractable(c.name)),
    ...candidates.filter((c) => !isExtractable(c.name)),
  ]
}

export function findDefaultMirror(episode: EpisodeData): MirrorCandidate | null {
  const order = buildFallbackOrder(episode.mirrors, '720p')
  return order.length > 0 ? order[0] : null
}

export function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const ms = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${ms}:${ss}` : `${m}:${ss}`
}

export function getEpNum(nav: { title: string; slug: string }[], slug: string): string {
  const ascending = [...nav].reverse()
  const idx = ascending.findIndex((ep) => ep.slug === slug)
  if (idx === -1) return '1'
  return ascending[idx].title.match(/episode\s*(\d+)/i)?.[1] ?? `${idx + 1}`
}

export function extractEpisodeNumber(slug: string): number | null {
  const match = slug.match(/episode-(\d+)/i)
  return match ? Number.parseInt(match[1]) : null
}

export function episodeNumFor(ep: { title: string }, index: number) {
  return ep.title.match(/episode\s*(\d+)/i)?.[1] ?? `${index + 1}`
}

const STORAGE_KEY = 'nimeplay:progress'

export const COMPLETED_PROGRESS_THRESHOLD = 0.87

export type WatchProgressStatus = 'unstarted' | 'in_progress' | 'completed'

export interface WatchProgress {
  currentTime: number
  duration: number
  updatedAt: number
  animeSlug: string
  episodeNum: string
  episodeSlug: string
}

function getProgressMap(): Record<string, WatchProgress> {
  if (!import.meta.client) return {}
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeProgressMap(map: Record<string, WatchProgress>) {
  if (!import.meta.client) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function markWatched(episodeSlug: string, data: Omit<WatchProgress, 'updatedAt' | 'episodeSlug'>) {
  const map = getProgressMap()
  map[episodeSlug] = {
    ...data,
    episodeSlug,
    currentTime: Math.max(data.currentTime, data.duration),
    duration: Math.max(data.duration, 1),
    updatedAt: Date.now(),
  }
  writeProgressMap(map)
}

export function saveProgress(episodeSlug: string, data: Omit<WatchProgress, 'updatedAt' | 'episodeSlug'>) {
  const map = getProgressMap()
  map[episodeSlug] = { ...data, episodeSlug, updatedAt: Date.now() }
  writeProgressMap(map)
}

export function getProgress(episodeSlug: string): WatchProgress | null {
  return getProgressMap()[episodeSlug] ?? null
}

export function getAllProgress(): WatchProgress[] {
  return Object.values(getProgressMap()).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getProgressRatio(progress: Pick<WatchProgress, 'currentTime' | 'duration'> | null): number {
  if (!progress || !progress.duration || progress.duration <= 0) return 0
  return Math.min(progress.currentTime / progress.duration, 1)
}

export function getProgressStatus(progress: Pick<WatchProgress, 'currentTime' | 'duration'> | string | null): WatchProgressStatus {
  const actual = typeof progress === 'string' ? getProgress(progress) : progress
  const ratio = getProgressRatio(actual)
  if (ratio >= COMPLETED_PROGRESS_THRESHOLD) return 'completed'
  if (ratio > 0) return 'in_progress'
  return 'unstarted'
}

export function getContinueWatching(): WatchProgress[] {
  const all = getAllProgress()
  const seen = new Set<string>()
  const result: WatchProgress[] = []
  for (const p of all) {
    if (!p.duration || p.duration <= 0) continue
    if (seen.has(p.animeSlug)) continue
    seen.add(p.animeSlug)
    result.push(p)
  }
  return result
}

export function getEpisodeProgress(episodeSlug: string): number {
  return getProgressRatio(getProgress(episodeSlug))
}

export function getEpisodeStatus(episodeSlug: string): WatchProgressStatus {
  return getProgressStatus(getProgress(episodeSlug))
}

export function isWatched(episodeSlug: string): boolean {
  return getEpisodeStatus(episodeSlug) === 'completed'
}

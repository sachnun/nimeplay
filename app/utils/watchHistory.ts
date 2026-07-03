import { getDb } from './db'

const COMPLETED_PROGRESS_THRESHOLD = 0.87

export type WatchProgressStatus = 'unstarted' | 'in_progress' | 'completed'

export interface WatchProgress {
  currentTime: number
  duration: number
  updatedAt: number
  animeSlug: string
  episodeNum: string
  episodeSlug: string
}

export async function markWatched(episodeSlug: string, data: Omit<WatchProgress, 'updatedAt' | 'episodeSlug'>) {
  if (!import.meta.client) return
  const entry: WatchProgress = {
    ...data,
    episodeSlug,
    currentTime: Math.max(data.currentTime, data.duration),
    duration: Math.max(data.duration, 1),
    updatedAt: Date.now(),
  }
  const db = await getDb()
  await db.put('progress', entry, episodeSlug)
}

export async function saveProgress(episodeSlug: string, data: Omit<WatchProgress, 'updatedAt' | 'episodeSlug'>) {
  if (!import.meta.client) return
  const entry: WatchProgress = { ...data, episodeSlug, updatedAt: Date.now() }
  const db = await getDb()
  await db.put('progress', entry, episodeSlug)
}

export async function getProgress(episodeSlug: string): Promise<WatchProgress | null> {
  if (!import.meta.client) return null
  try {
    const db = await getDb()
    return (await db.get('progress', episodeSlug)) ?? null
  } catch {
    return null
  }
}

export async function getAllProgress(): Promise<WatchProgress[]> {
  if (!import.meta.client) return []
  try {
    const db = await getDb()
    const all = await db.getAll('progress')
    return all.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export function getProgressRatio(progress: Pick<WatchProgress, 'currentTime' | 'duration'> | null): number {
  if (!progress || !progress.duration || progress.duration <= 0) return 0
  return Math.min(progress.currentTime / progress.duration, 1)
}

export async function getProgressStatus(progress: Pick<WatchProgress, 'currentTime' | 'duration'> | string | null): Promise<WatchProgressStatus> {
  const actual = typeof progress === 'string' ? await getProgress(progress) : progress
  const ratio = getProgressRatio(actual)
  if (ratio >= COMPLETED_PROGRESS_THRESHOLD) return 'completed'
  if (ratio > 0) return 'in_progress'
  return 'unstarted'
}

export async function getContinueWatching(): Promise<WatchProgress[]> {
  const all = await getAllProgress()
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

export async function getEpisodeStatus(episodeSlug: string): Promise<WatchProgressStatus> {
  return getProgressStatus(await getProgress(episodeSlug))
}

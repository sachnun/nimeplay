import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'nimeplay'
const DB_VERSION = 3
const COMPLETED_PROGRESS_THRESHOLD = 0.87

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        for (const store of ['progress', 'prefs']) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store)
        }
        if (oldVersion < 2) {
          for (const store of ['jikan', 'animeDetail', 'jikanData', 'skipTimes']) {
            if (db.objectStoreNames.contains(store)) db.deleteObjectStore(store)
          }
        }
        if (oldVersion < 3) {
          if (db.objectStoreNames.contains('progress')) db.deleteObjectStore('progress')
          db.createObjectStore('progress')
        }
      },
    })
  }
  return dbPromise
}

export async function getAutoSkip(): Promise<boolean> {
  if (!import.meta.client) return false
  try {
    const db = await getDb()
    return (await db.get('prefs', 'autoskip')) === '1'
  } catch {
    return false
  }
}

export async function setAutoSkip(value: boolean): Promise<void> {
  if (!import.meta.client) return
  const db = await getDb()
  await db.put('prefs', value ? '1' : '0', 'autoskip')
}

export type WatchProgressStatus = 'unstarted' | 'in_progress' | 'completed'

export interface WatchProgress {
  currentTime: number
  duration: number
  updatedAt: number
  malId: number
  episodeNumber: number
}

export function progressKey(malId: number, episodeNumber: number): string {
  return `${malId}:${episodeNumber}`
}

export async function markWatched(key: string, data: Omit<WatchProgress, 'updatedAt'>) {
  if (!import.meta.client) return
  const db = await getDb()
  await db.put('progress', {
    ...data,
    currentTime: Math.max(data.currentTime, data.duration),
    duration: Math.max(data.duration, 1),
    updatedAt: Date.now(),
  }, key)
}

export async function saveProgress(key: string, data: Omit<WatchProgress, 'updatedAt'>) {
  if (!import.meta.client) return
  const db = await getDb()
  await db.put('progress', { ...data, updatedAt: Date.now() }, key)
}

export async function getProgress(key: string): Promise<WatchProgress | null> {
  if (!import.meta.client) return null
  try {
    const db = await getDb()
    return (await db.get('progress', key)) ?? null
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
  const seen = new Set<number>()
  const result: WatchProgress[] = []
  for (const p of all) {
    if (!p.duration || p.duration <= 0) continue
    if (seen.has(p.malId)) continue
    seen.add(p.malId)
    result.push(p)
  }
  return result
}

export async function getEpisodeStatus(key: string): Promise<WatchProgressStatus> {
  return getProgressStatus(await getProgress(key))
}

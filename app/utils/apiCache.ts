import { getDb } from './db'
import type { AnimeDetail, JikanAnimeData, SkipTime } from '~/utils/types'

const TTL = {
  ANIME_DETAIL: 60 * 60 * 1000,
  JIKAN: 12 * 60 * 60 * 1000,
  SKIP_TIMES: 24 * 60 * 60 * 1000,
} as const

interface Stored<T> {
  storedAt: number
  data: T
}

function fresh<T>(entry: Stored<T>, ttl: number): boolean {
  return Date.now() - entry.storedAt < ttl
}

type StoreName = 'animeDetail' | 'jikanData' | 'skipTimes'

async function getEntry<T>(store: StoreName, key: string): Promise<Stored<T> | null> {
  if (!import.meta.client) return null
  try {
    const db = await getDb()
    return (await db.get(store, key)) ?? null
  } catch {
    return null
  }
}

async function setEntry<T>(store: StoreName, key: string, data: T): Promise<void> {
  if (!import.meta.client) return
  try {
    const db = await getDb()
    await db.put(store, { storedAt: Date.now(), data } satisfies Stored<T>, key)
  } catch {
  }
}

export {
  TTL,
  fresh,
}

// animeDetail

export async function getAnimeDetail(slug: string): Promise<AnimeDetail | null> {
  const entry = await getEntry<AnimeDetail>('animeDetail', slug)
  return entry?.data ?? null
}

export async function setAnimeDetail(slug: string, data: AnimeDetail): Promise<void> {
  await setEntry('animeDetail', slug, data)
}

export async function getFreshAnimeDetail(slug: string): Promise<AnimeDetail | null> {
  const entry = await getEntry<AnimeDetail>('animeDetail', slug)
  if (entry && fresh(entry, TTL.ANIME_DETAIL)) return entry.data
  return null
}

// jikanData

export async function getJikanData(slug: string): Promise<JikanAnimeData | null> {
  const entry = await getEntry<JikanAnimeData>('jikanData', slug)
  return entry?.data ?? null
}

export async function setJikanData(slug: string, data: JikanAnimeData): Promise<void> {
  await setEntry('jikanData', slug, data)
}

export async function getFreshJikanData(slug: string): Promise<JikanAnimeData | null> {
  const entry = await getEntry<JikanAnimeData>('jikanData', slug)
  if (entry && fresh(entry, TTL.JIKAN)) return entry.data
  return null
}

// skipTimes

export async function getSkipTimes(key: string): Promise<SkipTime[] | null> {
  const entry = await getEntry<SkipTime[]>('skipTimes', key)
  return entry?.data ?? null
}

export async function setSkipTimes(key: string, data: SkipTime[]): Promise<void> {
  await setEntry('skipTimes', key, data)
}

export async function getFreshSkipTimes(key: string): Promise<SkipTime[] | null> {
  const entry = await getEntry<SkipTime[]>('skipTimes', key)
  if (entry && fresh(entry, TTL.SKIP_TIMES)) return entry.data
  return null
}



import type { AnimeMetadata } from './types'

const sessionCache = new Map<number, Promise<AnimeMetadata | null>>()

export async function fetchAnimeMetadata(malId: number): Promise<AnimeMetadata | null> {
  const hit = sessionCache.get(malId)
  if (hit) return hit
  const pending = $fetch<AnimeMetadata | null>('/api/anime/metadata', {
    method: 'POST',
    body: { malId },
  }).catch(() => null)
  sessionCache.set(malId, pending)
  if (sessionCache.size > 50) sessionCache.delete(sessionCache.keys().next().value!)
  return pending
}

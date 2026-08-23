import type { AnimeMetadata } from './types'

export async function fetchAnimeMetadata(malId: number): Promise<AnimeMetadata | null> {
  try {
    return await $fetch<AnimeMetadata | null>('/api/anime/metadata', {
      method: 'POST',
      body: { malId },
    })
  } catch {
    return null
  }
}

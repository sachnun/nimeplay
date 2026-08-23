import type { AnimeMetadata } from './types'

export async function fetchAnimeMetadata(
  title: string,
  japaneseTitle?: string,
  cachedMalId?: number | null,
): Promise<AnimeMetadata | null> {
  try {
    return await $fetch<AnimeMetadata | null>('/api/anime/metadata', {
      method: 'POST',
      body: { title, japaneseTitle, malId: cachedMalId ?? null },
    })
  } catch {
    return null
  }
}

export async function searchMalId(title: string): Promise<number | null> {
  try {
    const res = await $fetch<{ malId: number | null }>('/api/anime/metadata', {
      method: 'POST',
      body: { title, idOnly: true },
    })
    return res?.malId ?? null
  } catch {
    return null
  }
}

import type { AnimeMetadata, SkipTime } from './types'

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

export async function fetchSynopsisId(malId: number | undefined, text: string): Promise<string | null> {
  const source = text.trim()
  if (!source) return null
  try {
    const res = await $fetch<{ text: string }>('/api/anime/translate', {
      method: 'POST',
      body: { malId: malId ?? null, text: source },
    })
    return res?.text?.trim() || null
  }
  catch {
    return null
  }
}

interface AniskipResponse {
  found: boolean
  results: SkipTime[]
}

const ANISKIP_TIMEOUT_MS = 6000

export async function fetchSkipTimes(malId: number, episode: number, episodeLength: number): Promise<SkipTime[]> {
  const length = Math.floor(episodeLength)
  const params = new URLSearchParams()
  params.append('types', 'op')
  params.append('types', 'ed')
  params.append('types', 'mixed-op')
  params.append('types', 'mixed-ed')
  params.append('types', 'recap')
  params.append('episodeLength', length.toString())
  const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?${params.toString()}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ANISKIP_TIMEOUT_MS) })
    if (!res.ok) return []
    const data: AniskipResponse = await res.json()
    return data.found ? data.results : []
  } catch {
    return []
  }
}

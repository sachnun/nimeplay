import type { JikanAnimeData, JikanCharacter } from '~/utils/types'

const JIKAN_BASE = 'https://api.jikan.moe/v4'
const JIKAN_TIMEOUT_MS = 8000

interface JikanAnimeDetailResponse {
  data: {
    synopsis?: string
    background?: string
    score?: number
    rank?: number
    popularity?: number
    rating?: string
    season?: string
    year?: number
    trailer?: { embed_url?: string }
  }
}

interface JikanCharacterEntry {
  character: { name: string; images: { jpg: { image_url: string } } }
  role: string
  favorites: number
  voice_actors: { person: { name: string; images: { jpg: { image_url: string } } }; language: string }[]
}

async function jikanFetch<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(`${JIKAN_BASE}${path}`, { signal })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function searchAnime(title: string, japaneseTitle?: string): Promise<number | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), JIKAN_TIMEOUT_MS)
  try {
    for (const q of (japaneseTitle ? [japaneseTitle, title] : [title])) {
      const data = await jikanFetch<{ data: { mal_id: number }[] }>(
        `/anime?q=${encodeURIComponent(q)}&limit=1`,
        controller.signal,
      )
      if (data?.data?.[0]) return data.data[0].mal_id
    }
    return null
  } finally {
    clearTimeout(timer)
  }
}

function mapCharacter(entry: JikanCharacterEntry): JikanCharacter {
  const jpVA = entry.voice_actors.find((va) => va.language === 'Japanese')
  return {
    name: entry.character.name,
    imageUrl: entry.character.images.jpg.image_url,
    role: entry.role === 'Main' ? 'Main' : 'Supporting',
    voiceActor: jpVA ? { name: jpVA.person.name, imageUrl: jpVA.person.images.jpg.image_url } : undefined,
  }
}

function splitCharacters(entries: JikanCharacterEntry[]) {
  return entries.reduce<{ main: JikanCharacter[]; supporting: JikanCharacter[] }>((groups, entry) => {
    const character = mapCharacter(entry)
    groups[character.role === 'Main' ? 'main' : 'supporting'].push(character)
    return groups
  }, { main: [], supporting: [] })
}

async function getAnimeDetail(malId: number): Promise<Omit<JikanAnimeData, 'characters'> | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), JIKAN_TIMEOUT_MS)
  try {
    const data = await jikanFetch<JikanAnimeDetailResponse>(`/anime/${malId}/full`, controller.signal)
    if (!data?.data) return null
    const d = data.data
    return {
      malId,
      synopsisEn: d.synopsis ?? '',
      background: d.background ?? '',
      malScore: d.score ?? null,
      malRank: d.rank ?? null,
      popularity: d.popularity ?? null,
      rating: d.rating ?? '',
      season: d.season ?? null,
      year: d.year ?? null,
      trailerEmbedUrl: d.trailer?.embed_url ?? null,
    }
  } finally {
    clearTimeout(timer)
  }
}

async function getCharacters(malId: number): Promise<JikanCharacter[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), JIKAN_TIMEOUT_MS)
  try {
    const data = await jikanFetch<{ data: JikanCharacterEntry[] }>(`/anime/${malId}/characters`, controller.signal)
    if (!data?.data) return []
    const { main, supporting } = splitCharacters(data.data)
    return [...main, ...supporting.slice(0, 10)]
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchJikanData(
  title: string,
  japaneseTitle?: string,
  cachedMalId?: number | null,
): Promise<JikanAnimeData | null> {
  try {
    const malId = cachedMalId ?? (await searchAnime(title, japaneseTitle))
    if (!malId) return null
    const [detail, characters] = await Promise.all([getAnimeDetail(malId), getCharacters(malId)])
    if (!detail) return null
    return { ...detail, characters }
  } catch {
    return null
  }
}

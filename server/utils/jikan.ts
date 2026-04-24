export interface JikanCharacter {
  name: string
  imageUrl: string
  role: 'Main' | 'Supporting'
  voiceActor?: { name: string; imageUrl: string }
}

export interface JikanAnimeData {
  malId: number
  synopsisEn: string
  background: string
  malScore: number | null
  malRank: number | null
  popularity: number | null
  rating: string
  season: string | null
  year: number | null
  trailerEmbedUrl: string | null
  characters: JikanCharacter[]
}

const JIKAN_BASE = 'https://api.jikan.moe/v4'

async function jikanFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${JIKAN_BASE}${path}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function searchAnime(title: string, japaneseTitle?: string): Promise<number | null> {
  const queries = japaneseTitle ? [japaneseTitle, title] : [title]
  for (const q of queries) {
    const data = await jikanFetch<{ data: { mal_id: number }[] }>(`/anime?q=${encodeURIComponent(q)}&limit=1`)
    if (data?.data?.[0]) return data.data[0].mal_id
  }
  return null
}

async function getAnimeDetail(malId: number): Promise<Omit<JikanAnimeData, 'characters'> | null> {
  const data = await jikanFetch<{
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
  }>(`/anime/${malId}/full`)
  if (!data?.data) return null
  const d = data.data
  return {
    malId,
    synopsisEn: d.synopsis || '',
    background: d.background || '',
    malScore: d.score ?? null,
    malRank: d.rank ?? null,
    popularity: d.popularity ?? null,
    rating: d.rating || '',
    season: d.season ?? null,
    year: d.year ?? null,
    trailerEmbedUrl: d.trailer?.embed_url ?? null,
  }
}

async function getCharacters(malId: number): Promise<JikanCharacter[]> {
  const data = await jikanFetch<{
    data: {
      character: { name: string; images: { jpg: { image_url: string } } }
      role: string
      favorites: number
      voice_actors: { person: { name: string; images: { jpg: { image_url: string } } }; language: string }[]
    }[]
  }>(`/anime/${malId}/characters`)
  if (!data?.data) return []

  const main: JikanCharacter[] = []
  const supporting: JikanCharacter[] = []
  for (const entry of data.data) {
    const jpVA = entry.voice_actors.find((va) => va.language === 'Japanese')
    const char: JikanCharacter = {
      name: entry.character.name,
      imageUrl: entry.character.images.jpg.image_url,
      role: entry.role === 'Main' ? 'Main' : 'Supporting',
      voiceActor: jpVA ? { name: jpVA.person.name, imageUrl: jpVA.person.images.jpg.image_url } : undefined,
    }
    if (entry.role === 'Main') main.push(char)
    else supporting.push(char)
  }
  return [...main, ...supporting.slice(0, 10)]
}

export async function fetchJikanData(title: string, japaneseTitle?: string, cachedMalId?: number | null): Promise<JikanAnimeData | null> {
  try {
    let malId = cachedMalId ?? null
    if (!malId) malId = await searchAnime(title, japaneseTitle)
    if (!malId) return null
    const [detail, characters] = await Promise.all([getAnimeDetail(malId), getCharacters(malId)])
    if (!detail) return null
    return { ...detail, characters }
  } catch {
    return null
  }
}

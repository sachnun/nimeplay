import { cached } from './cache'
import { timeoutSignal } from './fetch'

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
const JIKAN_TTL = 12 * 60 * 60 * 1000
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

async function jikanFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${JIKAN_BASE}${path}`, { signal: timeoutSignal(JIKAN_TIMEOUT_MS) })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

function stringOrEmpty(value: string | undefined): string {
  return value ?? ''
}

function numberOrNull(value: number | undefined): number | null {
  return value ?? null
}

function animeSearchQueries(title: string, japaneseTitle?: string) {
  return japaneseTitle ? [japaneseTitle, title] : [title]
}

export async function searchAnime(title: string, japaneseTitle?: string): Promise<number | null> {
  for (const q of animeSearchQueries(title, japaneseTitle)) {
    const data = await jikanFetch<{ data: { mal_id: number }[] }>(`/anime?q=${encodeURIComponent(q)}&limit=1`)
    if (data?.data?.[0]) return data.data[0].mal_id
  }
  return null
}

async function getAnimeDetail(malId: number): Promise<Omit<JikanAnimeData, 'characters'> | null> {
  const data = await jikanFetch<JikanAnimeDetailResponse>(`/anime/${malId}/full`)
  if (!data?.data) return null
  const d = data.data
  return {
    malId,
    synopsisEn: stringOrEmpty(d.synopsis),
    background: stringOrEmpty(d.background),
    malScore: numberOrNull(d.score),
    malRank: numberOrNull(d.rank),
    popularity: numberOrNull(d.popularity),
    rating: stringOrEmpty(d.rating),
    season: d.season ?? null,
    year: numberOrNull(d.year),
    trailerEmbedUrl: d.trailer?.embed_url ?? null,
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

async function getCharacters(malId: number): Promise<JikanCharacter[]> {
  const data = await jikanFetch<{ data: JikanCharacterEntry[] }>(`/anime/${malId}/characters`)
  if (!data?.data) return []

  const { main, supporting } = splitCharacters(data.data)
  return [...main, ...supporting.slice(0, 10)]
}

async function resolveMalId(title: string, japaneseTitle?: string, cachedMalId?: number | null) {
  return cachedMalId || await searchAnime(title, japaneseTitle)
}

async function fetchJikanDataFresh(title: string, japaneseTitle?: string, cachedMalId?: number | null): Promise<JikanAnimeData | null> {
  try {
    const malId = await resolveMalId(title, japaneseTitle, cachedMalId)
    if (!malId) return null
    const [detail, characters] = await Promise.all([getAnimeDetail(malId), getCharacters(malId)])
    if (!detail) return null
    return { ...detail, characters }
  } catch {
    return null
  }
}

export function fetchJikanData(title: string, japaneseTitle?: string, cachedMalId?: number | null): Promise<JikanAnimeData | null> {
  const key = cachedMalId ? `jikan:${cachedMalId}` : `jikan:${japaneseTitle || ''}:${title}`.toLowerCase()
  return cached(key, JIKAN_TTL, () => fetchJikanDataFresh(title, japaneseTitle, cachedMalId))
}

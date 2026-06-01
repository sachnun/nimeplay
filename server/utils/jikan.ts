import { Effect, pipe } from 'effect'
import { cache } from './cache'

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

function jikanGet<T>(path: string): Effect.Effect<T | null> {
  return pipe(
    Effect.tryPromise({
      try: () => fetch(`${JIKAN_BASE}${path}`, { signal: AbortSignal.timeout(JIKAN_TIMEOUT_MS) }),
      catch: () => null,
    }),
    Effect.flatMap((res) =>
      res.ok
        ? Effect.tryPromise({ try: () => res.json() as Promise<T>, catch: () => null })
        : Effect.succeed(null),
    ),
    Effect.retry({ times: 2 }),
    Effect.catchAll(() => Effect.succeed(null)),
  )
}

export async function searchAnime(title: string, japaneseTitle?: string): Promise<number | null> {
  for (const q of (japaneseTitle ? [japaneseTitle, title] : [title])) {
    const data = await Effect.runPromise(
      jikanGet<{ data: { mal_id: number }[] }>(`/anime?q=${encodeURIComponent(q)}&limit=1`),
    )
    if (data?.data?.[0]) return data.data[0].mal_id
  }
  return null
}

function getAnimeDetail(malId: number): Effect.Effect<Omit<JikanAnimeData, 'characters'> | null> {
  return pipe(
    jikanGet<JikanAnimeDetailResponse>(`/anime/${malId}/full`),
    Effect.map((data) => {
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
    }),
  )
}

function getCharacters(malId: number): Effect.Effect<JikanCharacter[]> {
  return pipe(
    jikanGet<{ data: JikanCharacterEntry[] }>(`/anime/${malId}/characters`),
    Effect.map((data) => {
      if (!data?.data) return []
      const { main, supporting } = splitCharacters(data.data)
      return [...main, ...supporting.slice(0, 10)]
    }),
  )
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

function fetchJikanDataEffect(title: string, japaneseTitle?: string, cachedMalId?: number | null): Effect.Effect<JikanAnimeData | null> {
  return pipe(
    Effect.gen(function* () {
      const malId = cachedMalId ?? (yield* Effect.promise(() => searchAnime(title, japaneseTitle)))
      if (!malId) return null
      const [detail, characters] = yield* Effect.all([getAnimeDetail(malId), getCharacters(malId)], { concurrency: 2 })
      return detail ? { ...detail, characters } : null
    }),
    Effect.catchAll(() => Effect.succeed(null)),
  )
}

export function fetchJikanData(title: string, japaneseTitle?: string, cachedMalId?: number | null): Promise<JikanAnimeData | null> {
  if (cachedMalId) {
    return cache.jikan.byId(cachedMalId, JIKAN_TTL, () => Effect.runPromise(fetchJikanDataEffect(title, japaneseTitle, cachedMalId))) as Promise<JikanAnimeData | null>
  }
  const key = `${japaneseTitle || ''}:${title}`.toLowerCase()
  return cache.jikan.byTitle(key, JIKAN_TTL, () => Effect.runPromise(fetchJikanDataEffect(title, japaneseTitle, cachedMalId))) as Promise<JikanAnimeData | null>
}
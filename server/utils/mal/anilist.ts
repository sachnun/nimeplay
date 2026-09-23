const ANILIST_URL = 'https://graphql.anilist.co'
const FETCH_TIMEOUT_MS = 15000
const MIN_INTERVAL_MS = 700

export interface JikanTitle {
  romaji?: string | null
  english?: string | null
  native?: string | null
}

export interface AniListSearchMedia {
  id: number
  idMal: number | null
  format?: string | null
  averageScore?: number | null
  popularity?: number | null
  season?: string | null
  seasonYear?: number | null
  genres?: string[] | null
  coverImage?: { extraLarge?: string | null, large?: string | null } | null
  title: JikanTitle
}

export interface AniListMedia {
  id: number
  idMal: number | null
  status?: string | null
  title: JikanTitle
  coverImage?: { extraLarge?: string | null, large?: string | null } | null
  description?: string | null
  averageScore?: number | null
  rankings?: { rank: number, type: string }[] | null
  popularity?: number | null
  season?: string | null
  seasonYear?: number | null
  trailer?: { id?: string | null, site?: string | null } | null
  studios?: { nodes?: { name: string }[] } | null
  genres?: string[] | null
  source?: string | null
  episodes?: number | null
  characters?: {
    edges?: {
      role?: string | null
      node?: { name?: { full?: string | null } | null, image?: { large?: string | null } | null } | null
      voiceActors?: { name?: { full?: string | null } | null, image?: { large?: string | null } | null }[] | null
    }[]
  } | null
}

const SEARCH_QUERY = `query ($search: String) {
  Page(perPage: 15) {
    media(search: $search, type: ANIME) {
      id
      idMal
      format
      averageScore
      popularity
      season
      seasonYear
      genres
      coverImage { extraLarge large }
      title { romaji english native }
    }
  }
}`

const MEDIA_QUERY = `query ($idMal: Int) {
  Media(idMal: $idMal, type: ANIME) {
    id
    idMal
    status
    title { romaji english native }
    coverImage { extraLarge large }
    description(asHtml: false)
    averageScore
    rankings { rank type }
    popularity
    season
    seasonYear
    trailer { id site }
    studios(isMain: true) { nodes { name } }
    genres
    source
    episodes
    characters(perPage: 25, sort: [ROLE, RELEVANCE]) {
      edges {
        role
        node { name { full } image { large } }
        voiceActors(language: JAPANESE) { name { full } image { large } }
      }
    }
  }
}`

let lastRequestAt = 0
let blockedUntil = 0

export async function acquireAniListSlot(): Promise<void> {
  for (;;) {
    const now = Date.now()
    const wait = Math.max(blockedUntil - now, MIN_INTERVAL_MS - (now - lastRequestAt))
    if (wait <= 0) break
    await new Promise(resolve => setTimeout(resolve, wait))
  }
  lastRequestAt = Date.now()
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await acquireAniListSlot()
    try {
      const res = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 5
        blockedUntil = Date.now() + retryAfter * 1000
        continue
      }
      if (!res.ok) {
        console.warn(`[anilist] ${res.status} ${res.statusText}`)
        return null
      }
      const body = await res.json() as { data?: T }
      return body.data ?? null
    }
    catch (error) {
      const message = error instanceof Error ? error.message : error
      console.warn('[anilist] fetch error:', message)
      if (typeof message === 'string' && message.includes('Too many subrequests')) return null
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  return null
}

export async function fetchAniListSearch(search: string): Promise<AniListSearchMedia[]> {
  const data = await graphql<{ Page?: { media?: AniListSearchMedia[] } }>(SEARCH_QUERY, { search })
  return data?.Page?.media ?? []
}

export async function fetchAniListMedia(idMal: number): Promise<AniListMedia | null> {
  const data = await graphql<{ Media?: AniListMedia }>(MEDIA_QUERY, { idMal })
  return data?.Media ?? null
}

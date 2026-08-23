const ANILIST_ENDPOINT = 'https://graphql.anilist.co'
const ANILIST_TIMEOUT_MS = 8000
const METADATA_TTL = 24 * 60 * 60 * 1000

const FULL_QUERY = `
query ($idMal: Int, $search: String) {
  Media(idMal: $idMal, search: $search, type: ANIME) {
    idMal
    description(asHtml: false)
    averageScore
    popularity
    season
    seasonYear
    trailer { id site }
    rankings { rank type allTime }
    characters(perPage: 25, sort: [ROLE, FAVOURITES_DESC]) {
      edges {
        role
        node { name { full } image { large } }
        voiceActors(language: JAPANESE) { name { full } image { large } }
      }
    }
  }
}`

const ID_QUERY = `
query ($idMal: Int, $search: String) {
  Media(idMal: $idMal, search: $search, type: ANIME) { idMal }
}`

interface MetadataRequestBody {
  title?: string
  japaneseTitle?: string
  malId?: number | null
  idOnly?: boolean
}

interface AniListMedia {
  idMal: number | null
  description?: string | null
  averageScore?: number | null
  popularity?: number | null
  season?: string | null
  seasonYear?: number | null
  trailer?: { id?: string | null; site?: string | null } | null
  rankings?: { rank: number; type: string; allTime: boolean }[] | null
  characters?: {
    edges: {
      role: string
      node: { name: { full: string }; image: { large: string | null } }
      voiceActors?: { name: { full: string }; image: { large: string | null } }[]
    }[]
  } | null
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function anilistQuery<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { ...getSpoofHeaders(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(ANILIST_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const json = await res.json() as { data?: { Media?: T | null } }
    return json.data?.Media ?? null
  } catch {
    return null
  }
}

async function resolveMedia(
  malId: number | null,
  japaneseTitle: string | undefined,
  title: string,
  idOnly: boolean,
): Promise<AniListMedia | null> {
  const query = idOnly ? ID_QUERY : FULL_QUERY
  if (malId) return anilistQuery<AniListMedia>(query, { idMal: malId })
  for (const search of [japaneseTitle, title]) {
    if (!search) continue
    const media = await anilistQuery<AniListMedia>(query, { search })
    if (media) return media
  }
  return null
}

function mapCharacter(edge: NonNullable<NonNullable<AniListMedia['characters']>['edges']>[number]) {
  const jpVA = edge.voiceActors?.[0]
  return {
    name: edge.node.name.full,
    imageUrl: edge.node.image.large || '',
    role: edge.role === 'MAIN' ? ('Main' as const) : ('Supporting' as const),
    voiceActor: jpVA ? { name: jpVA.name.full, imageUrl: jpVA.image.large || '' } : undefined,
  }
}

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  const body = await readBody<MetadataRequestBody>(event)
  const title = body?.title?.trim() || ''
  const japaneseTitle = body?.japaneseTitle?.trim() || undefined
  const malId = body?.malId ?? null

  if (!malId && !title) return null

  const cacheKey = `${body?.idOnly ? 'i' : 'f'}:${malId ?? ''}:${japaneseTitle ?? ''}:${title}`
  return cache.metadata.get(cacheKey, METADATA_TTL, async () => {
    const media = await resolveMedia(malId, japaneseTitle, title, body?.idOnly === true)
    if (!media) return null
    if (body?.idOnly === true) return { malId: media.idMal }

    const edges = media.characters?.edges ?? []
    const mapped = edges.map(mapCharacter)
    const main = mapped.filter((c) => c.role === 'Main')
    const supporting = mapped.filter((c) => c.role !== 'Main')
    return {
      malId: media.idMal,
      synopsisEn: stripHtml(media.description ?? ''),
      background: '',
      malScore: media.averageScore != null ? media.averageScore / 10 : null,
      malRank: media.rankings?.find((r) => r.type === 'RATED' && r.allTime)?.rank ?? null,
      popularity: media.popularity ?? null,
      rating: '',
      season: media.season ? media.season.toLowerCase() : null,
      year: media.seasonYear ?? null,
      trailerEmbedUrl: media.trailer?.site === 'youtube' && media.trailer.id
        ? `https://www.youtube.com/embed/${media.trailer.id}`
        : null,
      characters: [...main, ...supporting.slice(0, 10)],
    }
  }) as Promise<unknown>
})

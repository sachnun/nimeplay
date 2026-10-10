import { Effect } from 'effect'
import { AniList, runAniList, type AniListMedia } from './anilist'
import { decodeEntities, matchTitleOf, stripHtml, titleOf, titlesOf } from './matching'
import { cleanSynopsis } from './synopsis'

function catalogStatus(raw: string | null | undefined): 'ONGOING' | 'COMPLETED' | null {
  if (!raw) return null
  if (raw === 'FINISHED' || raw === 'CANCELLED') return 'COMPLETED'
  if (raw === 'RELEASING' || raw === 'NOT_YET_RELEASED' || raw === 'HIATUS') return 'ONGOING'
  return null
}

function seasonYear(media: Pick<AniListMedia, 'seasonYear' | 'startDate'>): number | null {
  return media.seasonYear ?? media.startDate?.year ?? null
}

function airDay(airingAt: number | null | undefined): number | null {
  if (!airingAt) return null
  const weekday = new Date((airingAt + 9 * 3600) * 1000).getUTCDay()
  return (weekday + 6) % 7
}

export function searchMalAnimeEntriesEffect(query: string): Effect.Effect<MalSearchEntry[], never, AniList> {
  const cleaned = query
    .replace(/[!?:,.'"“”‘’]/g, ' ')
    .replace(/\s+sub\s+indo.*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return Effect.succeed([])
  return Effect.gen(function* () {
  const api = yield* AniList
  const media = yield* api.search(cleaned)
  const entries = new Map<number, MalSearchEntry>()
  for (const item of media) {
    if (item.idMal == null) continue
    if (!entries.has(item.idMal)) {
      entries.set(item.idMal, {
        id: item.idMal,
        anilistId: item.id,
        title: matchTitleOf(item.title),
        titles: [
          ...new Set(
            [...titlesOf(item.title), ...(item.synonyms ?? [])]
              .map(value => decodeEntities(value).trim())
              .filter(Boolean),
          ),
        ],
        format: item.format ?? null,
        poster: item.coverImage?.extraLarge ?? item.coverImage?.large ?? null,
        score: item.averageScore != null ? Math.round(item.averageScore) / 10 : null,
        popularity: item.popularity ?? null,
        season: item.season ? item.season.toLowerCase() : null,
        year: seasonYear(item),
        genres: item.genres ?? [],
      })
    }
  }
  return [...entries.values()]
  })
}

export function searchMalAnimeEntries(query: string): Promise<MalSearchEntry[]> {
  return runAniList(searchMalAnimeEntriesEffect(query))
}

function mediaByTitle(malId: number, title: string | undefined): Effect.Effect<AniListMedia | null, never, AniList> {
  return Effect.gen(function* () {
    if (!title) return null
    const matches = yield* searchMalAnimeEntriesEffect(title)
    const candidate = matches.find(entry => entry.id === malId)
    if (!candidate?.anilistId) return null
    const api = yield* AniList
    return yield* api.mediaById(candidate.anilistId)
  })
}

function parseCharacters(media: AniListMedia): MalCharacter[] {
  const edges = media.characters?.edges ?? []
  return edges
    .slice(0, 25)
    .map((edge): MalCharacter => {
      const voiceActor = edge.voiceActors?.[0]
      const vaUrl = voiceActor?.image?.large ?? ''
      return {
        name: edge.node?.name?.full ?? '',
        imageUrl: edge.node?.image?.large ?? '',
        role: edge.role === 'MAIN' ? 'Main' : 'Supporting',
        voiceActor: voiceActor?.name?.full && vaUrl ? { name: voiceActor.name.full, imageUrl: vaUrl } : undefined,
      }
    })
    .filter(character => character.name && character.imageUrl)
}

export function fetchMalAnimeEffect(
  malId: number,
  fallbackTitle?: string,
): Effect.Effect<MalAnime | null, never, AniList> {
  return Effect.gen(function* () {
  const api = yield* AniList
  const media = (yield* api.media(malId)) ?? (yield* mediaByTitle(malId, fallbackTitle))
  if (!media) return null

  const trailer = media.trailer && media.trailer.site === 'youtube' ? (media.trailer.id ?? null) : null

  return {
    malId,
    title: titleOf(media.title),
    titles: titlesOf(media.title),
    type: media.format ?? null,
    poster: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
    synopsis: cleanSynopsis(decodeEntities(stripHtml(media.description ?? ''))),
    score: media.averageScore != null ? Math.round(media.averageScore) / 10 : null,
    rank: media.rankings?.find(entry => entry.type === 'RATED')?.rank ?? null,
    popularity: media.popularity ?? null,
    status: catalogStatus(media.status),
    season: media.season ? media.season.toLowerCase() : null,
    year: seasonYear(media),
    trailerId: trailer,
    studio: media.studios?.nodes?.map(studio => studio.name).join(', ') || null,
    episodeTotal: media.episodes ?? null,
    day: airDay(media.nextAiringEpisode?.airingAt),
    genres: media.genres ?? [],
    characters: parseCharacters(media),
  }
  })
}

export function fetchMalAnime(malId: number, fallbackTitle?: string): Promise<MalAnime | null> {
  return runAniList(fetchMalAnimeEffect(malId, fallbackTitle))
}

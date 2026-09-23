import { cleanSynopsis } from './synopsis'
import { fetchAniListMedia, fetchAniListSearch, type AniListMedia } from './anilist'
import { decodeEntities, matchTitleOf, sourceLabel, stripHtml, titleOf, titlesOf } from './matching'
import type { MalAnime, MalCharacter, MalSearchEntry } from './types'

export function catalogStatus(raw: string | null | undefined): 'ONGOING' | 'COMPLETED' | null {
  if (!raw) return null
  if (raw === 'FINISHED' || raw === 'CANCELLED') return 'COMPLETED'
  if (raw === 'RELEASING' || raw === 'NOT_YET_RELEASED' || raw === 'HIATUS') return 'ONGOING'
  return null
}

function seasonYear(media: Pick<AniListMedia, 'seasonYear' | 'startDate'>): number | null {
  return media.seasonYear ?? media.startDate?.year ?? null
}

export async function searchMalAnimeEntries(query: string): Promise<MalSearchEntry[]> {
  const cleaned = query
    .replace(/[!?:,.'"“”‘’]/g, ' ')
    .replace(/\s+sub\s+indo.*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return []
  const media = await fetchAniListSearch(cleaned)
  const entries = new Map<number, MalSearchEntry>()
  for (const item of media) {
    if (item.idMal == null) continue
    if (!entries.has(item.idMal)) {
      entries.set(item.idMal, {
        id: item.idMal,
        title: matchTitleOf(item.title),
        titles: [...new Set([...titlesOf(item.title), ...(item.synonyms ?? [])].map(value => decodeEntities(value).trim()).filter(Boolean))],
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
}

function parseCharacters(media: AniListMedia): MalCharacter[] {
  const edges = media.characters?.edges ?? []
  return edges.slice(0, 25).map((edge): MalCharacter => {
    const voiceActor = edge.voiceActors?.[0]
    const vaUrl = voiceActor?.image?.large ?? ''
    return {
      name: edge.node?.name?.full ?? '',
      imageUrl: edge.node?.image?.large ?? '',
      role: edge.role === 'MAIN' ? 'Main' : 'Supporting',
      voiceActor: voiceActor?.name?.full && vaUrl
        ? { name: voiceActor.name.full, imageUrl: vaUrl }
        : undefined,
    }
  }).filter(character => character.name && character.imageUrl)
}

export async function fetchMalAnime(malId: number): Promise<MalAnime | null> {
  const media = await fetchAniListMedia(malId)
  if (!media) return null

  const trailer = media.trailer && media.trailer.site === 'youtube' ? media.trailer.id ?? null : null

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
    source: sourceLabel(media.source),
    episodeTotal: media.episodes ?? null,
    genres: media.genres ?? [],
    characters: parseCharacters(media),
  }
}

import { and, asc, eq, sql } from 'drizzle-orm'
import { anime, animeGenres, animeSources, characters, episodes, genres, media } from '../../../database/schema'
import { posterSrc } from '../../media'
import { sourcePriority } from '../../sources'
import { cleanSynopsis } from '../../mal/synopsis'
import { db } from '../index'
import { CATALOG_READY, formatSeason } from './shared'
import type { AnimeCharacter, AnimeDetail, Genre } from '#shared/types'

export async function getGenresForAnime(animeId: number): Promise<Genre[]> {
  return db()
    .select({ name: genres.name, slug: genres.slug })
    .from(animeGenres)
    .innerJoin(genres, eq(genres.id, animeGenres.genreId))
    .where(eq(animeGenres.animeId, animeId))
}

export async function getCharactersForAnime(animeId: number): Promise<AnimeCharacter[]> {
  const rows = await db()
    .select({
      name: characters.name,
      role: characters.role,
      imageKey: characters.imageKey,
      voiceActorName: characters.voiceActorName,
      voiceActorKey: characters.voiceActorKey,
    })
    .from(characters)
    .innerJoin(media, eq(media.key, characters.imageKey))
    .where(eq(characters.animeId, animeId))
    .orderBy(asc(characters.sortOrder))

  return rows.map(row => ({
    name: row.name,
    imageUrl: posterSrc(row.imageKey),
    role: row.role === 'Main' ? 'Main' : 'Supporting',
    voiceActor: row.voiceActorName
      ? { name: row.voiceActorName, imageUrl: posterSrc(row.voiceActorKey) }
      : undefined,
  }))
}

interface AnimeRecord {
  id: number
  malId: number
  title: string
  posterKey: string | null
  synopsis: string | null
  rating: number | null
  season: string | null
  year: number | null
  status: string | null
  type: string | null
  studio: string | null
  source: string | null
}

async function getAnimeByMalId(malId: number): Promise<AnimeRecord | null> {
  const [row] = await db()
    .select({
      id: anime.id,
      malId: anime.malId,
      title: sql<string>`coalesce(${anime.title}, '')`,
      posterKey: anime.posterKey,
      synopsis: anime.synopsis,
      rating: anime.rating,
      season: anime.season,
      year: anime.year,
      status: anime.status,
      type: anime.type,
      studio: anime.studio,
      source: anime.source,
    })
    .from(anime)
    .where(and(eq(anime.malId, malId), CATALOG_READY))
    .limit(1)
  return row ? { ...row, malId: row.malId! } : null
}

export async function getAnimeDetail(malId: number): Promise<AnimeDetail | null> {
  const row = await getAnimeByMalId(malId)
  if (!row) return null

  const [sourceEpisodeRows, genreRows, characterRows] = await Promise.all([
    db()
      .select({ number: episodes.number, releaseDate: episodes.releaseDate, source: animeSources.source })
      .from(episodes)
      .innerJoin(animeSources, eq(animeSources.id, episodes.sourceId))
      .where(eq(animeSources.animeId, row.id)),
    getGenresForAnime(row.id),
    getCharactersForAnime(row.id),
  ])

  const episodeByNumber = new Map<number, { number: number, date: string }>()
  const chosenPriority = new Map<number, number>()
  for (const entry of sourceEpisodeRows) {
    const priority = sourcePriority(entry.source)
    const current = chosenPriority.get(entry.number)
    if (current === undefined || priority < current) {
      chosenPriority.set(entry.number, priority)
      episodeByNumber.set(entry.number, { number: entry.number, date: entry.releaseDate ?? '' })
    }
  }
  const episodeRows = [...episodeByNumber.values()].sort((a, b) => a.number - b.number)

  return {
    malId: row.malId,
    title: row.title,
    japanese: '',
    score: row.rating != null ? String(row.rating) : '',
    producer: '',
    type: row.type ?? '',
    status: row.status === 'COMPLETED' ? 'Completed' : 'Ongoing',
    totalEpisode: String(episodeRows.length),
    duration: '',
    releaseDate: '',
    studio: row.studio ?? '',
    source: row.source ?? '',
    genres: genreRows,
    thumbnail: posterSrc(row.posterKey),
    synopsis: cleanSynopsis(row.synopsis ?? ''),
    season: formatSeason(row.season, row.year),
    episodes: episodeRows,
    characters: characterRows,
  }
}

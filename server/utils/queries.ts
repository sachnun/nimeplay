import { and, asc, desc, eq, like, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { db } from './db'
import { anime, animeGenres, episodes, genres } from '../database/schema'

// API response shapes — mirrored by `app/utils/types.ts`.
export interface Genre {
  name: string
  slug: string
}

export interface AnimeCard {
  malId: number
  title: string
  thumbnail: string
  episode: string
  day: string
  date: string
  rating?: string
}

export interface SearchResult {
  malId: number
  title: string
  thumbnail: string
  genres: string
  status: string
  rating: string
}

export interface GenreAnimeCard {
  malId: number
  title: string
  thumbnail: string
  studio: string
  episodes: string
  rating: string
  genres: string
  date: string
}

export interface AnimeDetail {
  malId: number
  title: string
  japanese: string
  score: string
  producer: string
  type: string
  status: string
  totalEpisode: string
  duration: string
  releaseDate: string
  studio: string
  source: string
  genres: Genre[]
  thumbnail: string
  synopsis: string
  season?: string
  episodes: { number: number, date: string }[]
}

const PAGE_SIZE = 24

/**
 * Every public entry point requires MAL metadata to exist: rows still waiting
 * for their MyAnimeList match stay hidden from listings, search, and detail
 * routes (strict completeness, no fallback).
 */
const METADATA_READY = sql`${anime.malId} is not null`

/** "summer 2026" -> "Summer 2026" (MAL premiered format). */
function formatSeason(season: string | null): string {
  if (!season) return ''
  return season.replace(/(^|\s)\S/g, part => part.toUpperCase())
}

/** Season rank within a year: winter < spring < summer < fall. */
const SEASON_RANK = sql`case
  when ${anime.season} like 'winter%' then 1
  when ${anime.season} like 'spring%' then 2
  when ${anime.season} like 'summer%' then 3
  when ${anime.season} like 'fall%' then 4
  else 0 end`

/** Numeric year parsed from the tail of "summer 2026"-style season strings. */
const SEASON_YEAR = sql`case
  when length(${anime.season}) >= 4 and substr(${anime.season}, -4) glob '[0-9][0-9][0-9][0-9]'
  then cast(substr(${anime.season}, -4) as integer)
  else 0 end`

export async function listAnimePage(
  status: 'ONGOING' | 'COMPLETED',
  page: number,
): Promise<{ anime: AnimeCard[], totalPages: number }> {
  const filter = and(eq(anime.status, status), METADATA_READY)

  const [countRow] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(anime)
    .where(filter)
  const total = countRow?.count ?? 0

  // Ongoing follows Otakudesu: ordered by the newest episode upload, newest
  // first. Completed is grouped by season instead, newest season first.
  const orderBy = status === 'ONGOING'
    ? [sql`${anime.latestEpisodeAt} desc nulls last`, desc(anime.updatedAt)]
    : [desc(SEASON_YEAR), desc(SEASON_RANK), desc(anime.updatedAt)]

  const rows = await db()
    .select({
      malId: anime.malId,
      title: anime.title,
      poster: anime.poster,
      rating: anime.rating,
      day: anime.day,
      season: anime.season,
      updatedAt: anime.updatedAt,
      latestEpisodeAt: anime.latestEpisodeAt,
      latestEpisode: sql<number | null>`(select max(e.number) from episodes e where e.anime_slug = "anime"."slug")`,
    })
    .from(anime)
    .where(filter)
    .orderBy(...orderBy)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  return {
    anime: rows.map(row => ({
      malId: row.malId!,
      title: row.title,
      thumbnail: row.poster ?? '',
      episode: row.latestEpisode ? `Episode ${row.latestEpisode}` : '',
      day: row.day ?? '',
      date: formatSeason(row.season),
      rating: row.rating != null ? String(row.rating) : undefined,
    })),
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  }
}

export async function getGenreList(): Promise<Genre[]> {
  const rows = await db().select({ name: genres.name, slug: genres.slug }).from(genres).orderBy(asc(genres.name))
  return rows
}

export async function searchAnime(query: string): Promise<SearchResult[]> {
  const gr = alias(genres, 'gr')
  const rows = await db()
    .select({
      malId: anime.malId,
      title: anime.title,
      thumbnail: sql<string>`coalesce(${anime.poster}, '')`,
      status: sql<string>`coalesce(${anime.status}, '')`,
      rating: sql<string>`coalesce(cast(${anime.rating} as text), '')`,
      genres: sql<string>`coalesce(group_concat(${gr.name}, ', '), '')`,
    })
    .from(anime)
    .leftJoin(animeGenres, eq(animeGenres.animeSlug, anime.slug))
    .leftJoin(gr, eq(gr.id, animeGenres.genreId))
    .where(and(like(anime.title, `%${query}%`), METADATA_READY))
    .groupBy(anime.slug)
    .limit(20)

  return rows.map(row => ({ ...row, malId: row.malId! }))
}

export async function getGenresForAnime(animeSlug: string): Promise<Genre[]> {
  return db()
    .select({ name: genres.name, slug: genres.slug })
    .from(animeGenres)
    .innerJoin(genres, eq(genres.id, animeGenres.genreId))
    .where(eq(animeGenres.animeSlug, animeSlug))
}

interface AnimeRecord {
  slug: string
  malId: number
  title: string
  poster: string | null
  synopsis: string | null
  rating: number | null
  season: string | null
  status: string | null
  type: string | null
  studio: string | null
  source: string | null
}

async function getAnimeByMalId(malId: number): Promise<AnimeRecord | null> {
  const [row] = await db()
    .select({
      slug: anime.slug,
      malId: anime.malId,
      title: anime.title,
      poster: anime.poster,
      synopsis: anime.synopsis,
      rating: anime.rating,
      season: anime.season,
      status: anime.status,
      type: anime.type,
      studio: anime.studio,
      source: anime.source,
    })
    .from(anime)
    .where(and(eq(anime.malId, malId), METADATA_READY))
    .limit(1)
  return row ? { ...row, malId: row.malId! } : null
}

export async function getAnimeDetail(malId: number): Promise<AnimeDetail | null> {
  const row = await getAnimeByMalId(malId)
  if (!row) return null

  const episodeRows = await db()
    .select({ number: episodes.number, releaseDate: episodes.releaseDate })
    .from(episodes)
    .innerJoin(anime, eq(anime.slug, episodes.animeSlug))
    .where(eq(anime.malId, malId))
    .orderBy(asc(episodes.number))

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
    genres: await getGenresForAnime(row.slug),
    thumbnail: row.poster ?? '',
    synopsis: row.synopsis ?? '',
    season: row.season ?? '',
    episodes: episodeRows.map(entry => ({
      number: entry.number,
      date: entry.releaseDate ?? '',
    })),
  }
}

/** Resolve an episode by MAL id + episode number (URL scheme: /anime/{malId}/{episode}). */
export async function resolveEpisode(
  malId: number,
  number: number,
): Promise<{ anime: { title: string, thumbnail: string }, sourceSlug: string, episodeTitle: string } | null> {
  const row = await db()
    .select({
      title: anime.title,
      poster: anime.poster,
      episodeSlug: episodes.slug,
      episodeTitle: episodes.title,
    })
    .from(episodes)
    .innerJoin(anime, eq(anime.slug, episodes.animeSlug))
    .where(and(eq(anime.malId, malId), eq(episodes.number, number)))
    .limit(1)

  const match = row[0]
  if (!match) return null
  return {
    anime: { title: match.title, thumbnail: match.poster ?? '' },
    sourceSlug: match.episodeSlug,
    episodeTitle: match.episodeTitle,
  }
}

export async function getGenreAnimePage(
  slug: string,
  page: number,
): Promise<{ anime: GenreAnimeCard[], totalPages: number } | null> {
  const [genre] = await db().select({ id: genres.id }).from(genres).where(eq(genres.slug, slug)).limit(1)
  if (!genre) return null

  const filter = and(eq(animeGenres.genreId, genre.id), METADATA_READY)

  const [countRow] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(animeGenres)
    .innerJoin(anime, eq(anime.slug, animeGenres.animeSlug))
    .where(filter)
  const total = countRow?.count ?? 0

  const rows = await db()
    .select({
      slug: anime.slug,
      malId: anime.malId,
      title: anime.title,
      poster: anime.poster,
      rating: anime.rating,
      season: anime.season,
      updatedAt: anime.updatedAt,
    })
    .from(animeGenres)
    .innerJoin(anime, eq(anime.slug, animeGenres.animeSlug))
    .where(filter)
    .orderBy(sql`${anime.rating} desc nulls first`, desc(anime.updatedAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  const cards: GenreAnimeCard[] = []
  for (const row of rows) {
    cards.push({
      malId: row.malId!,
      title: row.title,
      thumbnail: row.poster ?? '',
      studio: '',
      episodes: '',
      rating: row.rating != null ? String(row.rating) : '',
      genres: (await getGenresForAnime(row.slug)).map(genreEntry => genreEntry.name).join(', '),
      date: formatSeason(row.season),
    })
  }

  return { anime: cards, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

export async function getLatestEpisodes(malIds: number[]): Promise<Map<number, number>> {
  if (malIds.length === 0) return new Map()
  const rows = await db()
    .select({
      malId: anime.malId,
      latest: sql<number>`max(${episodes.number})`,
    })
    .from(anime)
    .innerJoin(episodes, eq(episodes.animeSlug, anime.slug))
    .where(sql`${anime.malId} in (${sql.join(malIds.map(id => sql`${id}`), sql`, `)})`)
    .groupBy(anime.malId)
  return new Map(rows.map(row => [row.malId!, Number(row.latest)]))
}

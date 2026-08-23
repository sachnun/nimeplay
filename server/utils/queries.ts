import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
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

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

/** "summer 2026" -> "Summer 2026" (MAL premiered format). */
function formatSeason(season: string | null): string {
  if (!season) return ''
  return season.replace(/(^|\s)\S/g, part => part.toUpperCase())
}

export async function listAnimePage(
  status: 'ONGOING' | 'COMPLETED',
  page: number,
): Promise<{ anime: AnimeCard[], totalPages: number }> {
  const filter = and(eq(anime.status, status), METADATA_READY)

  const [countRow] = await db()
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(anime)
    .where(filter)
  const total = countRow?.count ?? 0

  const rows = await db()
    .select({
      malId: anime.malId,
      title: anime.title,
      poster: anime.poster,
      rating: anime.rating,
      day: anime.day,
      season: anime.season,
      updatedAt: anime.updatedAt,
      latestEpisode: sql<number | null>`(select max(e.number) from episodes e where e.anime_slug = "anime"."slug")`,
    })
    .from(anime)
    .where(filter)
    .orderBy(desc(anime.updatedAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  return {
    anime: rows.map(row => ({
      malId: row.malId!,
      title: row.title,
      thumbnail: row.poster ?? '',
      episode: row.latestEpisode ? `Episode ${row.latestEpisode}` : '',
      day: row.day ?? '',
      date: formatSeason(row.season) || formatDate(row.updatedAt),
      rating: row.rating ?? undefined,
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
      rating: sql<string>`coalesce(${anime.rating}::text, '')`,
      genres: sql<string>`coalesce(string_agg(distinct ${gr.name}, ', '), '')`,
    })
    .from(anime)
    .leftJoin(animeGenres, eq(animeGenres.animeSlug, anime.slug))
    .leftJoin(gr, eq(gr.id, animeGenres.genreId))
    .where(and(ilike(anime.title, `%${query}%`), METADATA_READY))
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
  rating: string | null
  season: string | null
  status: string | null
  type: string | null
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
    score: row.rating ?? '',
    producer: '',
    type: row.type ?? '',
    status: row.status === 'COMPLETED' ? 'Completed' : 'Ongoing',
    totalEpisode: String(episodeRows.length),
    duration: '',
    releaseDate: '',
    studio: '',
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
    .select({ count: sql<number>`cast(count(*) as int)` })
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
    .orderBy(desc(anime.rating), desc(anime.updatedAt))
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
      rating: row.rating ?? '',
      genres: (await getGenresForAnime(row.slug)).map(genreEntry => genreEntry.name).join(', '),
      date: formatSeason(row.season) || formatDate(row.updatedAt),
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

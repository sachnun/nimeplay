import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { db } from './db'
import { posterSrc } from './r2'
import { anime, animeGenres, episodes, genres } from '../database/schema'
import { cache } from './cache'

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
const BIND_CHUNK_SIZE = 40

const LIST_TTL_MS = 3 * 60 * 1000
const GENRE_TTL_MS = 10 * 60 * 1000
const GENRE_PAGE_TTL_MS = 3 * 60 * 1000
const DETAIL_TTL_MS = 2 * 60 * 1000
const SEARCH_TTL_MS = 60 * 1000

const METADATA_READY = sql`${anime.malId} is not null`

function formatSeason(season: string | null): string {
  if (!season) return ''
  return season.replace(/(^|\s)\S/g, part => part.toUpperCase())
}

function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size))
  return chunks
}

const SEASON_RANK = sql`case
  when ${anime.season} like 'winter%' then 1
  when ${anime.season} like 'spring%' then 2
  when ${anime.season} like 'summer%' then 3
  when ${anime.season} like 'fall%' then 4
  else 0 end`

const SEASON_YEAR = sql`case
  when length(${anime.season}) >= 4 and substr(${anime.season}, -4) glob '[0-9][0-9][0-9][0-9]'
  then cast(substr(${anime.season}, -4) as integer)
  else 0 end`

export function listAnimePage(status: 'ONGOING' | 'COMPLETED', page: number): Promise<{ anime: AnimeCard[], totalPages: number }> {
  return cache.get('list', `${status}:${page}`, LIST_TTL_MS, () => listAnimePageFresh(status, page)) as Promise<{ anime: AnimeCard[], totalPages: number }>
}

async function listAnimePageFresh(
  status: 'ONGOING' | 'COMPLETED',
  page: number,
): Promise<{ anime: AnimeCard[], totalPages: number }> {
  const filter = and(eq(anime.status, status), METADATA_READY)

  const orderBy = status === 'ONGOING'
    ? [sql`${anime.lastNewEpisodeAt} desc nulls last`, sql`${anime.ongoingRank} asc nulls last`, sql`${anime.latestEpisodeAt} desc nulls last`, desc(anime.updatedAt)]
    : [desc(SEASON_YEAR), desc(SEASON_RANK), desc(anime.updatedAt)]

  const countQuery = db()
    .select({ count: sql<number>`count(*)` })
    .from(anime)
    .where(filter)

  const rowsQuery = db()
    .select({
      slug: anime.slug,
      malId: anime.malId,
      title: anime.title,
      poster: anime.poster,
      rating: anime.rating,
      day: anime.day,
      season: anime.season,
    })
    .from(anime)
    .where(filter)
    .orderBy(...orderBy)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  const [[countRow], rows] = await Promise.all([countQuery, rowsQuery])
  const total = countRow?.count ?? 0
  if (rows.length === 0) {
    return { anime: [], totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
  }

  const maxBySlug = new Map<string, number>()
  const slugChunks = chunkValues(rows.map(row => row.slug), BIND_CHUNK_SIZE)
  const maxResults = await Promise.all(slugChunks.map(chunk =>
    db()
      .select({ slug: episodes.animeSlug, max: sql<number | null>`max(${episodes.number})` })
      .from(episodes)
      .where(inArray(episodes.animeSlug, chunk))
      .groupBy(episodes.animeSlug),
  ))
  for (const maxRows of maxResults) {
    for (const entry of maxRows) {
      if (entry.max != null) maxBySlug.set(entry.slug, Number(entry.max))
    }
  }

  return {
    anime: rows.map(row => ({
      malId: row.malId!,
      title: row.title,
      thumbnail: posterSrc(row.poster),
      episode: maxBySlug.get(row.slug) ? `Episode ${maxBySlug.get(row.slug)}` : '',
      day: row.day ?? '',
      date: formatSeason(row.season),
      rating: row.rating != null ? String(row.rating) : undefined,
    })),
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  }
}

export function getGenreList(): Promise<Genre[]> {
  return cache.get('genres', 'all', GENRE_TTL_MS, () => getGenreListFresh()) as Promise<Genre[]>
}

async function getGenreListFresh(): Promise<Genre[]> {
  const rows = await db().select({ name: genres.name, slug: genres.slug }).from(genres).orderBy(asc(genres.name))
  return rows
}

export function searchAnime(query: string): Promise<SearchResult[]> {
  const key = query.trim().toLowerCase().slice(0, 80)
  if (!key) return Promise.resolve([])
  return cache.get('search', key, SEARCH_TTL_MS, () => searchAnimeFresh(query.trim())) as Promise<SearchResult[]>
}

async function searchAnimeFresh(query: string): Promise<SearchResult[]> {
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
    .where(and(sql`${anime.title} like ${`%${escapeLike(query)}%`} escape '\\'`, METADATA_READY))
    .groupBy(anime.slug)
    .limit(20)

  return rows.map(row => ({ ...row, thumbnail: posterSrc(row.thumbnail), malId: row.malId! }))
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

export function getAnimeDetail(malId: number): Promise<AnimeDetail | null> {
  return cache.get('detail', malId, DETAIL_TTL_MS, () => getAnimeDetailFresh(malId)) as Promise<AnimeDetail | null>
}

async function getAnimeDetailFresh(malId: number): Promise<AnimeDetail | null> {
  const row = await getAnimeByMalId(malId)
  if (!row) return null

  const [episodeRows, genreRows] = await Promise.all([
    db()
      .select({ number: episodes.number, releaseDate: episodes.releaseDate })
      .from(episodes)
      .where(eq(episodes.animeSlug, row.slug))
      .orderBy(asc(episodes.number)),
    getGenresForAnime(row.slug),
  ])

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
    thumbnail: posterSrc(row.poster),
    synopsis: row.synopsis ?? '',
    season: row.season ?? '',
    episodes: episodeRows.map(entry => ({
      number: entry.number,
      date: entry.releaseDate ?? '',
    })),
  }
}

export async function resolveEpisode(
  malId: number,
  number: number,
): Promise<{ anime: { title: string, thumbnail: string }, animeSlug: string, sourceSlug: string, episodeTitle: string } | null> {
  const row = await db()
    .select({
      title: anime.title,
      poster: anime.poster,
      animeSlug: anime.slug,
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
    anime: { title: match.title, thumbnail: posterSrc(match.poster) },
    animeSlug: match.animeSlug,
    sourceSlug: match.episodeSlug,
    episodeTitle: match.episodeTitle,
  }
}

export function getEpisodeNumbers(animeSlug: string): Promise<number[]> {
  return cache.get('episodes', animeSlug, DETAIL_TTL_MS, async () => {
    const rows = await db()
      .select({ number: episodes.number })
      .from(episodes)
      .where(eq(episodes.animeSlug, animeSlug))
      .orderBy(asc(episodes.number))
    return rows.map(entry => entry.number)
  }) as Promise<number[]>
}

export function getGenreAnimePage(
  slug: string,
  page: number,
): Promise<{ anime: GenreAnimeCard[], totalPages: number } | null> {
  return cache.get('genre-page', `${slug}:${page}`, GENRE_PAGE_TTL_MS, () => getGenreAnimePageFresh(slug, page)) as Promise<{ anime: GenreAnimeCard[], totalPages: number } | null>
}

async function getGenreAnimePageFresh(
  slug: string,
  page: number,
): Promise<{ anime: GenreAnimeCard[], totalPages: number } | null> {
  const [genre] = await db().select({ id: genres.id }).from(genres).where(eq(genres.slug, slug)).limit(1)
  if (!genre) return null

  const filter = and(eq(animeGenres.genreId, genre.id), METADATA_READY)

  const countQuery = db()
    .select({ count: sql<number>`count(*)` })
    .from(animeGenres)
    .innerJoin(anime, eq(anime.slug, animeGenres.animeSlug))
    .where(filter)

  const allGenres = alias(genres, 'all_genres')
  const allAnimeGenres = alias(animeGenres, 'all_anime_genres')

  const rowsQuery = db()
    .select({
      malId: anime.malId,
      title: anime.title,
      thumbnail: sql<string>`coalesce(${anime.poster}, '')`,
      rating: sql<string>`coalesce(cast(${anime.rating} as text), '')`,
      season: anime.season,
      genres: sql<string>`coalesce(group_concat(${allGenres.name}, ', '), '')`,
    })
    .from(animeGenres)
    .innerJoin(anime, eq(anime.slug, animeGenres.animeSlug))
    .leftJoin(allAnimeGenres, eq(allAnimeGenres.animeSlug, anime.slug))
    .leftJoin(allGenres, eq(allGenres.id, allAnimeGenres.genreId))
    .where(filter)
    .groupBy(anime.slug)
    .orderBy(sql`${anime.rating} desc nulls last`, desc(anime.updatedAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  const [[countRow], rows] = await Promise.all([countQuery, rowsQuery])
  const total = countRow?.count ?? 0

  const cards: GenreAnimeCard[] = rows.map(row => ({
    malId: row.malId!,
    title: row.title,
    thumbnail: posterSrc(row.thumbnail),
    studio: '',
    episodes: '',
    rating: row.rating,
    genres: row.genres,
    date: formatSeason(row.season),
  }))

  return { anime: cards, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

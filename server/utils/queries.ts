import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from './db'
import { toFtsQuery } from './fts'
import { posterSrc } from './media'
import { anime, animeGenres, characters, episodes, genres, media } from '../database/schema'
import { cleanSynopsis } from './synopsis'
import type { AnimeCard, AnimeCharacter, AnimeDetail, Genre, GenreAnimeCard, SearchResult } from '#shared/types'

const PAGE_SIZE = 24
const BIND_CHUNK_SIZE = 40

const CATALOG_READY = sql`${anime.malId} is not null and ${anime.episodeCount} > 0 and (${anime.status} is distinct from 'COMPLETED' or (${anime.extra} ->> 'episodeTotal') is null or ${anime.episodeCount} >= (${anime.extra} ->> 'episodeTotal')::int)`

function formatSeason(season: string | null, year: number | null): string {
  if (!season) return year ? String(year) : ''
  const name = season.replace(/(^|\s)\S/g, part => part.toUpperCase())
  return year ? `${name} ${year}` : name
}

const SEASON_RANK = sql`case
  when ${anime.season} = 'winter' then 1
  when ${anime.season} = 'spring' then 2
  when ${anime.season} = 'summer' then 3
  when ${anime.season} = 'fall' then 4
  else 0 end`

async function getStatusCount(status: 'ONGOING' | 'COMPLETED'): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(anime)
    .where(and(eq(anime.status, status), CATALOG_READY))
  return row?.count ?? 0
}

async function getGenreCount(genreId: number): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(animeGenres)
    .innerJoin(anime, eq(anime.id, animeGenres.animeId))
    .where(and(eq(animeGenres.genreId, genreId), CATALOG_READY))
  return row?.count ?? 0
}

export async function listAnimePage(
  status: 'ONGOING' | 'COMPLETED',
  page: number,
): Promise<{ anime: AnimeCard[], totalPages: number }> {
  const filter = and(eq(anime.status, status), CATALOG_READY)

  const orderBy = status === 'ONGOING'
    ? [sql`${anime.lastNewEpisodeAt} desc nulls last`, sql`${anime.ongoingRank} asc nulls last`, sql`${anime.latestEpisodeAt} desc nulls last`, desc(anime.updatedAt)]
    : [sql`${anime.year} desc nulls last`, desc(SEASON_RANK), asc(anime.title), asc(anime.id)]

  const rowsQuery = db()
    .select({
      id: anime.id,
      malId: anime.malId,
      title: sql<string>`coalesce(${anime.title}, '')`,
      posterKey: anime.posterKey,
      rating: anime.rating,
      day: anime.day,
      season: anime.season,
      year: anime.year,
    })
    .from(anime)
    .where(filter)
    .orderBy(...orderBy)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  const [total, rows] = await Promise.all([getStatusCount(status), rowsQuery])
  if (rows.length === 0) {
    return { anime: [], totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
  }

  const maxById = new Map<number, number>()
  const ids = rows.map(row => row.id)
  for (let i = 0; i < ids.length; i += BIND_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BIND_CHUNK_SIZE)
    const maxRows = await db()
      .select({ animeId: episodes.animeId, max: sql<number | null>`max(${episodes.number})` })
      .from(episodes)
      .where(inArray(episodes.animeId, chunk))
      .groupBy(episodes.animeId)
    for (const entry of maxRows) {
      if (entry.max != null) maxById.set(entry.animeId, Number(entry.max))
    }
  }

  return {
    anime: rows.map(row => ({
      malId: row.malId!,
      title: row.title,
      thumbnail: posterSrc(row.posterKey),
      episode: maxById.get(row.id) ? `Episode ${maxById.get(row.id)}` : '',
      day: row.day ?? '',
      date: formatSeason(row.season, row.year),
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
  const trimmed = query.trim()
  if (!trimmed) return []
  const match = toFtsQuery(trimmed)
  if (!match) return []
  const result = await db().execute(sql`
    select a.mal_id as "malId", coalesce(a.title, '') as title, a.poster_key as "posterKey",
      coalesce(a.status, '') as status,
      coalesce(cast(a.rating as text), '') as rating,
      coalesce(string_agg(g.name, ', '), '') as genres
    from anime a
    left join anime_genres ag on ag.anime_id = a.id
    left join genres g on g.id = ag.genre_id
    where a.mal_id is not null
      and a.episode_count > 0
      and (a.status is distinct from 'COMPLETED' or (a.extra ->> 'episodeTotal') is null or a.episode_count >= (a.extra ->> 'episodeTotal')::int)
      and to_tsvector('simple', a.title) @@ to_tsquery('simple', ${match})
    group by a.id
    order by ts_rank(to_tsvector('simple', a.title), to_tsquery('simple', ${match})) desc
    limit 20
  `)

  return result.rows.map(row => ({
    malId: Number(row.malId),
    title: String(row.title),
    thumbnail: posterSrc(row.posterKey as string | null),
    status: String(row.status),
    rating: String(row.rating),
    genres: String(row.genres),
  }))
}

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
  slug: string
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
      slug: anime.slug,
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

  const [episodeRows, genreRows] = await Promise.all([
    db()
      .select({ number: episodes.number, releaseDate: episodes.releaseDate })
      .from(episodes)
      .where(eq(episodes.animeId, row.id))
      .orderBy(asc(episodes.number)),
    getGenresForAnime(row.id),
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
    thumbnail: posterSrc(row.posterKey),
    synopsis: cleanSynopsis(row.synopsis ?? ''),
    season: formatSeason(row.season, row.year),
    episodes: episodeRows.map(entry => ({
      number: entry.number,
      date: entry.releaseDate ?? '',
    })),
  }
}

export async function resolveEpisode(
  malId: number,
  number: number,
): Promise<{ animeId: number, animeSlug: string, anime: { title: string, thumbnail: string }, sourceSlug: string, episodeTitle: string } | null> {
  const row = await db()
    .select({
      animeId: anime.id,
      animeSlug: anime.slug,
      title: sql<string>`coalesce(${anime.title}, '')`,
      posterKey: anime.posterKey,
      episodeSlug: episodes.slug,
      episodeTitle: episodes.title,
    })
    .from(episodes)
    .innerJoin(anime, eq(anime.id, episodes.animeId))
    .where(and(eq(anime.malId, malId), eq(episodes.number, number)))
    .limit(1)

  const match = row[0]
  if (!match) return null
  return {
    animeId: match.animeId,
    animeSlug: match.animeSlug,
    anime: { title: match.title, thumbnail: posterSrc(match.posterKey) },
    sourceSlug: match.episodeSlug,
    episodeTitle: match.episodeTitle,
  }
}

export async function getEpisodeNumbers(animeId: number): Promise<number[]> {
  const rows = await db()
    .select({ number: episodes.number })
    .from(episodes)
    .where(eq(episodes.animeId, animeId))
    .orderBy(asc(episodes.number))
  return rows.map(entry => entry.number)
}

export async function getGenreAnimePage(
  slug: string,
  page: number,
): Promise<{ anime: GenreAnimeCard[], totalPages: number } | null> {
  const [genre] = await db().select({ id: genres.id }).from(genres).where(eq(genres.slug, slug)).limit(1)
  if (!genre) return null

  const filter = and(eq(animeGenres.genreId, genre.id), CATALOG_READY)

  const allGenres = alias(genres, 'all_genres')
  const allAnimeGenres = alias(animeGenres, 'all_anime_genres')

  const rowsQuery = db()
    .select({
      malId: anime.malId,
      title: sql<string>`coalesce(${anime.title}, '')`,
      posterKey: anime.posterKey,
      episodeCount: anime.episodeCount,
      rating: sql<string>`coalesce(cast(${anime.rating} as text), '')`,
      season: anime.season,
      year: anime.year,
      genres: sql<string>`coalesce(string_agg(${allGenres.name}, ', '), '')`,
    })
    .from(animeGenres)
    .innerJoin(anime, eq(anime.id, animeGenres.animeId))
    .leftJoin(allAnimeGenres, eq(allAnimeGenres.animeId, anime.id))
    .leftJoin(allGenres, eq(allGenres.id, allAnimeGenres.genreId))
    .where(filter)
    .groupBy(anime.id)
    .orderBy(sql`${anime.rating} desc nulls last`, desc(anime.updatedAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  const [total, rows] = await Promise.all([getGenreCount(genre.id), rowsQuery])

  const cards: GenreAnimeCard[] = rows.map(row => ({
    malId: row.malId!,
    title: row.title,
    thumbnail: posterSrc(row.posterKey),
    studio: '',
    episodes: row.episodeCount > 0 ? `${row.episodeCount} Eps` : '',
    rating: row.rating,
    genres: row.genres,
    date: formatSeason(row.season, row.year),
  }))

  return { anime: cards, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

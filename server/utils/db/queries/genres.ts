import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { anime, animeGenres, genres } from '../../../database/schema'
import { posterSrc } from '../../media'
import { db } from '../index'
import { CATALOG_READY, PAGE_SIZE, formatSeason } from './shared'
import type { Genre, GenreAnimeCard } from '#shared/types'

export async function getGenreList(): Promise<Genre[]> {
  const rows = await db().select({ name: genres.name, slug: genres.slug }).from(genres).orderBy(asc(genres.name))
  return rows
}

async function getGenreCount(genreId: number): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(animeGenres)
    .innerJoin(anime, eq(anime.id, animeGenres.animeId))
    .where(and(eq(animeGenres.genreId, genreId), CATALOG_READY))
  return row?.count ?? 0
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
      total: sql<number>`cast(count(*) over() as integer)`,
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

  const rows = await rowsQuery
  if (rows.length === 0) {
    const total = await getGenreCount(genre.id)
    return { anime: [], totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
  }

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

  return { anime: cards, totalPages: Math.max(1, Math.ceil(rows[0]!.total / PAGE_SIZE)) }
}

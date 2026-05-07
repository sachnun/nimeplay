import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { animeEpisodes, animeGenres, genres, latestFeedItems, malAnime, otakudesuAnime, type AnimeKind } from '../db/schema'
import type { JikanAnimeData } from '../utils/jikan'
import type { AnimeCard, AnimeDetail, Genre, GenreAnimeCard, SearchResult } from '../utils/scraper'

const PAGE_SIZE = 24

type AnimeRow = typeof otakudesuAnime.$inferSelect
type MalRow = typeof malAnime.$inferSelect

function totalPages(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE))
}

function scoreNumber(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function episodeText(anime: AnimeRow, mal: MalRow): string {
  return anime.latestEpisode || (mal.episodes ? `${mal.episodes} Episode` : anime.sourceTotalEpisode)
}

function mapAnimeCard(row: { anime: AnimeRow; mal: MalRow; feedEpisode?: string | null; feedDay?: string | null; feedDate?: string | null; feedRating?: string | null }): AnimeCard {
  return {
    title: row.mal.title,
    slug: row.anime.slug,
    thumbnail: row.mal.imageUrl,
    episode: row.feedEpisode || episodeText(row.anime, row.mal),
    day: row.feedDay || row.anime.latestDay,
    date: row.feedDate || row.anime.latestDate,
    rating: row.feedRating || row.anime.latestRating || row.mal.score || undefined,
  }
}

function animeTypeFilter(type: AnimeKind) {
  return type === 'COMPLETED' ? eq(otakudesuAnime.isCompleted, true) : eq(otakudesuAnime.isOngoing, true)
}

function syncedAnimeFilter(type?: AnimeKind) {
  const base = [eq(otakudesuAnime.syncStatus, 'SYNCED'), sql`${otakudesuAnime.malId} is not null`]
  if (type) base.push(animeTypeFilter(type))
  return and(...base)
}

export async function getAnimePage(type: AnimeKind, page = 1): Promise<{ anime: AnimeCard[]; totalPages: number }> {
  const db = getDb()
  const offset = (page - 1) * PAGE_SIZE
  const [totalRow] = await db.select({ value: count() })
    .from(otakudesuAnime)
    .innerJoin(malAnime, eq(malAnime.malId, otakudesuAnime.malId))
    .where(syncedAnimeFilter(type))

  const rows = await db.select({
    anime: otakudesuAnime,
    mal: malAnime,
    feedEpisode: latestFeedItems.episode,
    feedDay: latestFeedItems.day,
    feedDate: latestFeedItems.date,
    feedRating: latestFeedItems.rating,
  })
    .from(otakudesuAnime)
    .innerJoin(malAnime, eq(malAnime.malId, otakudesuAnime.malId))
    .leftJoin(latestFeedItems, and(eq(latestFeedItems.animeSlug, otakudesuAnime.slug), eq(latestFeedItems.kind, type)))
    .where(syncedAnimeFilter(type))
    .orderBy(sql`case when ${latestFeedItems.position} is null then 1 else 0 end`, asc(latestFeedItems.position), desc(otakudesuAnime.updatedAt), asc(malAnime.title))
    .limit(PAGE_SIZE)
    .offset(offset)

  return { anime: rows.map(mapAnimeCard), totalPages: totalPages(totalRow?.value || 0) }
}

export async function getHomeData() {
  const [ongoingData, completedData, genreList] = await Promise.all([
    getAnimePage('ONGOING', 1),
    getAnimePage('COMPLETED', 1),
    getGenreList(),
  ])
  return { ongoingData, completedData, genres: genreList }
}

async function genreRowsForAnime(slug: string): Promise<Genre[]> {
  return getDb().select({ name: genres.name, slug: genres.slug })
    .from(animeGenres)
    .innerJoin(genres, eq(genres.slug, animeGenres.genreSlug))
    .where(eq(animeGenres.animeSlug, slug))
    .orderBy(asc(genres.name))
}

async function episodesForAnime(slug: string): Promise<AnimeDetail['episodes']> {
  return getDb().select({ title: animeEpisodes.title, slug: animeEpisodes.slug, date: animeEpisodes.date })
    .from(animeEpisodes)
    .where(eq(animeEpisodes.animeSlug, slug))
    .orderBy(asc(animeEpisodes.sortOrder))
}

function releaseDate(mal: MalRow, anime: AnimeRow): string {
  if (mal.season && mal.year) return `${mal.season} ${mal.year}`
  if (mal.year) return String(mal.year)
  return anime.sourceReleaseDate
}

function totalEpisode(mal: MalRow, anime: AnimeRow): string {
  return mal.episodes ? String(mal.episodes) : anime.sourceTotalEpisode
}

function studioText(mal: MalRow, anime: AnimeRow): string {
  return mal.studios.length > 0 ? mal.studios.join(', ') : anime.sourceStudio
}

function mapAnimeDetail(anime: AnimeRow, mal: MalRow, genreList: Genre[], episodes: AnimeDetail['episodes']) {
  return {
    title: mal.title,
    japanese: mal.titleJapanese || anime.japaneseTitle,
    score: mal.score || anime.sourceScore,
    producer: anime.sourceProducer,
    type: mal.type || anime.sourceType,
    status: mal.status || anime.sourceStatus,
    totalEpisode: totalEpisode(mal, anime),
    duration: mal.duration || anime.sourceDuration,
    releaseDate: releaseDate(mal, anime),
    studio: studioText(mal, anime),
    genres: genreList,
    thumbnail: mal.imageUrl,
    synopsis: mal.synopsis,
    episodes,
    malId: mal.malId,
    background: mal.background,
    malRank: mal.rank,
    popularity: mal.popularity,
    rating: mal.rating,
    season: mal.season,
    year: mal.year,
    trailerEmbedUrl: mal.trailerEmbedUrl,
    characters: mal.characters || [],
  }
}

export async function getAnimeDetail(slug: string) {
  const [row] = await getDb().select({ anime: otakudesuAnime, mal: malAnime })
    .from(otakudesuAnime)
    .innerJoin(malAnime, eq(malAnime.malId, otakudesuAnime.malId))
    .where(and(eq(otakudesuAnime.slug, slug), syncedAnimeFilter()))
    .limit(1)

  if (!row) return null
  const [genreList, episodes] = await Promise.all([genreRowsForAnime(slug), episodesForAnime(slug)])
  return mapAnimeDetail(row.anime, row.mal, genreList, episodes)
}

export async function getAnimeDetails(slugs: string[]) {
  return Promise.all(slugs.map(async (slug) => ({ slug, anime: await getAnimeDetail(slug) })))
}

export async function getGenreList(): Promise<Genre[]> {
  return getDb().selectDistinct({ name: genres.name, slug: genres.slug })
    .from(genres)
    .innerJoin(animeGenres, eq(animeGenres.genreSlug, genres.slug))
    .innerJoin(otakudesuAnime, eq(otakudesuAnime.slug, animeGenres.animeSlug))
    .where(syncedAnimeFilter())
    .orderBy(asc(genres.name))
}

async function genreStringByAnime(slugs: string[]) {
  if (slugs.length === 0) return new Map<string, string>()
  const rows = await getDb().select({ animeSlug: animeGenres.animeSlug, name: genres.name })
    .from(animeGenres)
    .innerJoin(genres, eq(genres.slug, animeGenres.genreSlug))
    .where(inArray(animeGenres.animeSlug, slugs))
    .orderBy(asc(genres.name))

  const map = new Map<string, string[]>()
  for (const row of rows) map.set(row.animeSlug, [...(map.get(row.animeSlug) || []), row.name])
  return new Map([...map.entries()].map(([slug, names]) => [slug, names.join(', ')]))
}

export async function getGenreAnime(slug: string, page = 1): Promise<{ anime: GenreAnimeCard[]; totalPages: number }> {
  const db = getDb()
  const offset = (page - 1) * PAGE_SIZE
  const [totalRow] = await db.select({ value: count() })
    .from(animeGenres)
    .innerJoin(otakudesuAnime, eq(otakudesuAnime.slug, animeGenres.animeSlug))
    .innerJoin(malAnime, eq(malAnime.malId, otakudesuAnime.malId))
    .where(and(eq(animeGenres.genreSlug, slug), syncedAnimeFilter()))

  const rows = await db.select({ anime: otakudesuAnime, mal: malAnime })
    .from(animeGenres)
    .innerJoin(otakudesuAnime, eq(otakudesuAnime.slug, animeGenres.animeSlug))
    .innerJoin(malAnime, eq(malAnime.malId, otakudesuAnime.malId))
    .where(and(eq(animeGenres.genreSlug, slug), syncedAnimeFilter()))
    .orderBy(desc(otakudesuAnime.updatedAt), asc(malAnime.title))
    .limit(PAGE_SIZE)
    .offset(offset)

  const genresByAnime = await genreStringByAnime(rows.map((row) => row.anime.slug))
  return {
    anime: rows.map(({ anime, mal }) => ({
      title: mal.title,
      slug: anime.slug,
      thumbnail: mal.imageUrl,
      studio: studioText(mal, anime),
      episodes: totalEpisode(mal, anime),
      rating: mal.score || anime.sourceScore,
      genres: genresByAnime.get(anime.slug) || '',
      date: releaseDate(mal, anime) || anime.latestDate,
    })),
    totalPages: totalPages(totalRow?.value || 0),
  }
}

export async function searchAnime(query: string): Promise<SearchResult[]> {
  const like = `%${query}%`
  const rows = await getDb().select({ anime: otakudesuAnime, mal: malAnime })
    .from(otakudesuAnime)
    .innerJoin(malAnime, eq(malAnime.malId, otakudesuAnime.malId))
    .where(and(
      syncedAnimeFilter(),
      or(
        ilike(malAnime.title, like),
        ilike(malAnime.titleEnglish, like),
        ilike(malAnime.titleJapanese, like),
        ilike(otakudesuAnime.title, like),
      ),
    ))
    .orderBy(asc(malAnime.title))
    .limit(20)

  const genresByAnime = await genreStringByAnime(rows.map((row) => row.anime.slug))
  return rows.map(({ anime, mal }) => ({
    title: mal.title,
    slug: anime.slug,
    thumbnail: mal.imageUrl,
    genres: genresByAnime.get(anime.slug) || '',
    status: mal.status || anime.sourceStatus,
    rating: mal.score || anime.sourceScore,
  }))
}

export async function getPersistedJikanData(input: { title: string; japaneseTitle?: string; cachedMalId?: number | null }): Promise<JikanAnimeData | null> {
  const where = input.cachedMalId
    ? eq(malAnime.malId, input.cachedMalId)
    : or(eq(malAnime.title, input.title), eq(malAnime.titleJapanese, input.japaneseTitle || ''), eq(malAnime.titleEnglish, input.title))

  const [row] = await getDb().select().from(malAnime).where(where).limit(1)
  if (!row) return null

  return {
    malId: row.malId,
    synopsisEn: row.synopsis || '',
    background: row.background || '',
    malScore: scoreNumber(row.score),
    malRank: row.rank,
    popularity: row.popularity,
    rating: row.rating,
    season: row.season,
    year: row.year,
    trailerEmbedUrl: row.trailerEmbedUrl,
    characters: row.characters || [],
  }
}

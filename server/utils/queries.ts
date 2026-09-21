import { and, asc, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from './db'
import { toFtsQuery } from './fts'
import { posterSrc } from './media'
import { anime, animeGenres, animeSources, characters, episodes, genres, media } from '../database/schema'
import { getSources, sourcePriority } from './sources'
import { cleanSynopsis } from './synopsis'
import type { EpisodeData } from './sources/types'
import type { AnimeCard, AnimeCharacter, AnimeDetail, Genre, GenreAnimeCard, SearchResult } from '#shared/types'

const PAGE_SIZE = 24
const BIND_CHUNK_SIZE = 40

function isPlayable(source: string, cache: EpisodeData | null, blocked: Set<string>): boolean {
  return !blocked.has(source) || (cache?.mirrors?.length ?? 0) > 0
}

function blockedSourceIds(): Set<string> {
  return new Set(getSources().filter(source => source.workerBlocked === true).map(source => source.id))
}

const BLOCKED_SOURCE_IDS = [...blockedSourceIds()]

function playableEpisodeExists(id: SQL): SQL {
  const playable = BLOCKED_SOURCE_IDS.length === 0
    ? sql`true`
    : sql`s.source <> all(${sql.raw(`array[${BLOCKED_SOURCE_IDS.map(source => `'${source}'`).join(',')}]::text[]`)}) or coalesce(jsonb_array_length(e.cache -> 'mirrors'), 0) > 0`
  return sql`exists (select 1 from episodes e join anime_sources s on s.id = e.source_id where s.anime_id = ${id} and (${playable}))`
}

function posterReady(posterKey: SQL): SQL {
  return sql`${posterKey} is not null and exists (select 1 from media m where m.key = ${posterKey})`
}

const CATALOG_READY = sql`${anime.malId} is not null and ${posterReady(sql`${anime.posterKey}`)} and ${playableEpisodeExists(sql`${anime.id}`)} and (${anime.status} is distinct from 'COMPLETED' or (${anime.extra} ->> 'episodeTotal') is null or ${anime.episodeCount} >= (${anime.extra} ->> 'episodeTotal')::int)`

const RECENT_EPISODE_SQL = sql`now() - interval '7 days'`

function statusCondition(status: 'ONGOING' | 'COMPLETED') {
  return status === 'COMPLETED'
    ? eq(anime.status, 'COMPLETED')
    : or(eq(anime.status, 'ONGOING'), sql`${anime.latestEpisodeAt} >= ${RECENT_EPISODE_SQL}`)
}

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
    .where(and(statusCondition(status), CATALOG_READY))
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
  const filter = and(statusCondition(status), CATALOG_READY)

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
      .select({ animeId: animeSources.animeId, max: sql<number | null>`max(${episodes.number})` })
      .from(episodes)
      .innerJoin(animeSources, eq(animeSources.id, episodes.sourceId))
      .where(inArray(animeSources.animeId, chunk))
      .groupBy(animeSources.animeId)
    for (const entry of maxRows) {
      if (entry.max != null && entry.animeId != null) maxById.set(entry.animeId, Number(entry.max))
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

function toSearchResult(row: Record<string, unknown>): SearchResult {
  return {
    malId: Number(row.malId),
    title: String(row.title),
    thumbnail: posterSrc(row.posterKey as string | null),
    status: String(row.status),
    rating: String(row.rating),
    genres: String(row.genres),
  }
}

async function searchByFullText(match: string): Promise<SearchResult[]> {
  const result = await db().execute(sql`
    select
      a.mal_id as "malId",
      coalesce(a.title, '') as title,
      a.poster_key as "posterKey",
      coalesce(a.status, '') as status,
      coalesce(cast(a.rating as text), '') as rating,
      coalesce((
        select string_agg(g.name, ', ' order by g.name)
        from anime_genres ag
        join genres g on g.id = ag.genre_id
        where ag.anime_id = a.id
      ), '') as genres
    from (
      select
        anime.id,
        anime.mal_id,
        anime.title,
        anime.poster_key,
        anime.status,
        anime.rating,
        setweight(to_tsvector('simple', coalesce(anime.title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce((
          select string_agg(title_value, ' ')
          from jsonb_array_elements_text(anime.extra -> 'titles') as titles(title_value)
        ), '')), 'A') ||
        setweight(to_tsvector('simple', concat_ws(' ', anime.studio, anime.type, anime.source)), 'B') ||
        setweight(to_tsvector('simple', coalesce((
          select string_agg(g.name, ' ')
          from anime_genres ag
          join genres g on g.id = ag.genre_id
          where ag.anime_id = anime.id
        ), '')), 'C') ||
        setweight(to_tsvector('simple', coalesce((
          select string_agg(ch.name || ' ' || coalesce(ch.voice_actor_name, ''), ' ')
          from characters ch
          where ch.anime_id = anime.id
        ), '')), 'C') ||
        setweight(to_tsvector('simple', coalesce(anime.synopsis, '')), 'D') as doc
      from anime
      where anime.mal_id is not null
        and ${posterReady(sql`${anime.posterKey}`)}
        and ${playableEpisodeExists(sql`${anime.id}`)}
        and (anime.status is distinct from 'COMPLETED' or (anime.extra ->> 'episodeTotal') is null or anime.episode_count >= (anime.extra ->> 'episodeTotal')::int)
    ) a
    where a.doc @@ to_tsquery('simple', ${match})
    order by ts_rank(a.doc, to_tsquery('simple', ${match})) desc, a.rating desc nulls last
    limit 20
  `)
  return result.rows.map(toSearchResult)
}

async function searchBySimilarity(raw: string): Promise<SearchResult[]> {
  const result = await db().execute(sql`
    select
      a.mal_id as "malId",
      coalesce(a.title, '') as title,
      a.poster_key as "posterKey",
      coalesce(a.status, '') as status,
      coalesce(cast(a.rating as text), '') as rating,
      coalesce((
        select string_agg(g.name, ', ' order by g.name)
        from anime_genres ag
        join genres g on g.id = ag.genre_id
        where ag.anime_id = a.id
      ), '') as genres,
      greatest(similarity(coalesce(a.title, ''), ${raw}), coalesce(alt.sim, 0)) as sim
    from anime a
    left join lateral (
      select max(similarity(title_value, ${raw})) as sim
      from jsonb_array_elements_text(a.extra -> 'titles') as titles(title_value)
    ) alt on true
    where a.mal_id is not null
      and ${posterReady(sql.raw('a.poster_key'))}
      and ${playableEpisodeExists(sql.raw('a.id'))}
      and (a.status is distinct from 'COMPLETED' or (a.extra ->> 'episodeTotal') is null or a.episode_count >= (a.extra ->> 'episodeTotal')::int)
      and (a.title % ${raw} or coalesce(alt.sim, 0) >= 0.3)
    order by sim desc, a.rating desc nulls last
    limit 20
  `)
  return result.rows.map(toSearchResult)
}

export async function searchAnime(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const match = toFtsQuery(trimmed)
  if (match) {
    const rows = await searchByFullText(match)
    if (rows.length > 0) return rows
  }
  return searchBySimilarity(trimmed)
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
      .select({ number: episodes.number, releaseDate: episodes.releaseDate, source: animeSources.source, cache: episodes.cache })
      .from(episodes)
      .innerJoin(animeSources, eq(animeSources.id, episodes.sourceId))
      .where(eq(animeSources.animeId, row.id)),
    getGenresForAnime(row.id),
    getCharactersForAnime(row.id),
  ])

  const blocked = blockedSourceIds()
  const episodeByNumber = new Map<number, { number: number, date: string }>()
  const chosenPriority = new Map<number, number>()
  for (const entry of sourceEpisodeRows) {
    if (!isPlayable(entry.source, entry.cache, blocked)) continue
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

export interface EpisodeCandidate {
  episodeSlug: string
  source: string
}

export async function resolveEpisode(
  malId: number,
  number: number,
): Promise<{ animeId: number, anime: { title: string, thumbnail: string }, candidates: EpisodeCandidate[] } | null> {
  const rows = await db()
    .select({
      animeId: anime.id,
      title: sql<string>`coalesce(${anime.title}, '')`,
      posterKey: anime.posterKey,
      episodeSlug: episodes.slug,
      source: animeSources.source,
    })
    .from(episodes)
    .innerJoin(animeSources, eq(animeSources.id, episodes.sourceId))
    .innerJoin(anime, eq(anime.id, animeSources.animeId))
    .where(and(eq(anime.malId, malId), eq(episodes.number, number)))

  if (rows.length === 0) return null
  rows.sort((a, b) => sourcePriority(a.source) - sourcePriority(b.source))
  const first = rows[0]!
  return {
    animeId: first.animeId,
    anime: { title: first.title, thumbnail: posterSrc(first.posterKey) },
    candidates: rows.map(row => ({ episodeSlug: row.episodeSlug, source: row.source })),
  }
}

export async function getEpisodeNumbers(animeId: number): Promise<number[]> {
  const rows = await db()
    .select({ number: episodes.number, source: animeSources.source, cache: episodes.cache })
    .from(episodes)
    .innerJoin(animeSources, eq(animeSources.id, episodes.sourceId))
    .where(eq(animeSources.animeId, animeId))

  const blocked = blockedSourceIds()
  const numbers = new Set<number>()
  for (const entry of rows) {
    if (isPlayable(entry.source, entry.cache, blocked)) numbers.add(entry.number)
  }
  return [...numbers].sort((a, b) => a - b)
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

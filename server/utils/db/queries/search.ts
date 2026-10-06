import { sql } from 'drizzle-orm'
import type { SearchResult } from '#shared/types'
import { anime } from '../../../database/schema'
import { posterSrc } from '../../media'
import { db, resultRows } from '../index'
import { notBlockedGenre, playableEpisodeExists } from './shared'

interface SearchRow {
  malId: number
  title: string
  posterKey: string | null
  status: string
  rating: string
  genres: string
}

const SEARCH_COLUMNS = sql`
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
`

function toFtsQuery(query: string): string | null {
  const tokens = query.match(/[\p{L}\p{N}]+/gu)?.slice(0, 5) ?? []
  if (tokens.length === 0) return null
  return tokens.map(token => `${token}:*`).join(' & ')
}

function toSearchResult(row: SearchRow): SearchResult {
  return {
    malId: row.malId,
    title: row.title,
    thumbnail: posterSrc(row.posterKey),
    status: row.status,
    rating: row.rating,
    genres: row.genres,
  }
}

async function searchByFullText(match: string): Promise<SearchResult[]> {
  const result = await db().execute(sql`
    select ${SEARCH_COLUMNS}
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
        setweight(to_tsvector('simple', concat_ws(' ', anime.studio, anime.type)), 'B') ||
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
        and ${playableEpisodeExists(sql`${anime.id}`)}
        and ${notBlockedGenre(sql`${anime.id}`)}
        and (anime.status is distinct from 'COMPLETED' or (anime.extra ->> 'episodeTotal') is null or anime.episode_count >= (anime.extra ->> 'episodeTotal')::int)
    ) a
    where a.doc @@ to_tsquery('simple', ${match})
    order by ts_rank(a.doc, to_tsquery('simple', ${match})) desc, a.rating desc nulls last
    limit 20
  `)
  return resultRows<SearchRow>(result).map(toSearchResult)
}

async function searchBySimilarity(raw: string): Promise<SearchResult[]> {
  const result = await db().execute(sql`
    select
      ${SEARCH_COLUMNS},
      greatest(similarity(coalesce(a.title, ''), ${raw}), coalesce(alt.sim, 0)) as sim
    from anime a
    left join lateral (
      select max(similarity(title_value, ${raw})) as sim
      from jsonb_array_elements_text(a.extra -> 'titles') as titles(title_value)
    ) alt on true
    where a.mal_id is not null
      and ${playableEpisodeExists(sql.raw('a.id'))}
      and ${notBlockedGenre(sql.raw('a.id'))}
      and (a.status is distinct from 'COMPLETED' or (a.extra ->> 'episodeTotal') is null or a.episode_count >= (a.extra ->> 'episodeTotal')::int)
      and (a.title % ${raw} or coalesce(alt.sim, 0) >= 0.3)
    order by sim desc, a.rating desc nulls last
    limit 20
  `)
  return resultRows<SearchRow>(result).map(toSearchResult)
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

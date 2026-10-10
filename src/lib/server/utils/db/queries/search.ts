import { sql, type SQL } from 'drizzle-orm'
import type { SearchResult } from '#lib/shared/types'
import { db, resultRows } from '../../db'
import { posterSrc } from '../../media'
import { notBlockedGenre, playableEpisodeExists } from './shared'

export interface SearchOptions {
  query: string
  genreSlug?: string
}

interface SearchRow {
  malId: number
  title: string
  posterKey: string | null
  status: string
  rating: string
  genres: string
}

interface ScoredRow extends SearchRow {
  sim: number
  genreMatch: boolean
  titleMatch: boolean
  characterMatch: boolean
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

const TITLE_DOC = sql`(
  setweight(to_tsvector('simple', coalesce(a.title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce((
    select string_agg(t.value, ' ') from jsonb_array_elements_text(a.extra -> 'titles') t(value)
  ), '')), 'A')
)`

const CATALOG_READY = sql`
  a.mal_id is not null
  and ${playableEpisodeExists(sql.raw('a.id'))}
  and ${notBlockedGenre(sql.raw('a.id'))}
  and (a.status is distinct from 'COMPLETED' or (a.extra ->> 'episodeTotal') is null or a.episode_count >= (a.extra ->> 'episodeTotal')::int)
`

function genreMatch(genreSlug?: string): SQL {
  if (!genreSlug) return sql`false`
  return sql`exists (
    select 1 from anime_genres ag
    join genres g on g.id = ag.genre_id
    where ag.anime_id = a.id and g.slug = ${genreSlug}
  )`
}

function titleMatch(match: string | null): SQL {
  if (!match) return sql`false`
  return sql`${TITLE_DOC} @@ to_tsquery('simple', ${match})`
}

export function searchTokens(query: string): string[] {
  return query.match(/[\p{L}\p{N}]+/gu)?.slice(0, 5) ?? []
}

export function toFtsQuery(tokens: string[]): string | null {
  if (tokens.length === 0) return null
  return tokens.map(token => `${token}:*`).join(' & ')
}

export function toAnyFtsQuery(tokens: string[]): string | null {
  if (tokens.length === 0) return null
  return tokens.map(token => `${token}:*`).join(' | ')
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

function compareRows(a: ScoredRow, b: ScoredRow): number {
  if (a.genreMatch !== b.genreMatch) return a.genreMatch ? -1 : 1
  if (a.titleMatch !== b.titleMatch) return a.titleMatch ? -1 : 1
  if (a.characterMatch !== b.characterMatch) return a.characterMatch ? -1 : 1
  return b.sim - a.sim || Number(b.rating || 0) - Number(a.rating || 0)
}

function mergeRows(groups: ScoredRow[][]): SearchResult[] {
  const best = new Map<number, ScoredRow>()
  for (const row of groups.flat()) {
    const current = best.get(row.malId)
    if (!current || compareRows(row, current) < 0) best.set(row.malId, row)
  }
  return [...best.values()].toSorted(compareRows).slice(0, 20).map(toSearchResult)
}

async function searchByFullText(match: string, genreSlug?: string): Promise<ScoredRow[]> {
  const result = await db().execute(sql`
    select
      ${SEARCH_COLUMNS},
      ts_rank(a.search_doc, to_tsquery('simple', ${match})) as sim,
      ${genreMatch(genreSlug)} as "genreMatch",
      ${titleMatch(match)} as "titleMatch",
      false as "characterMatch"
    from anime a
    where a.search_doc @@ to_tsquery('simple', ${match})
      and ${CATALOG_READY}
    order by "genreMatch" desc, "titleMatch" desc, sim desc, a.rating desc nulls last
    limit 20
  `)
  return resultRows<ScoredRow>(result)
}

async function searchByTitleSimilarity(raw: string, genreSlug?: string): Promise<ScoredRow[]> {
  const result = await db().execute(sql`
    select
      ${SEARCH_COLUMNS},
      greatest(similarity(coalesce(a.title, ''), ${raw}), coalesce(alt.sim, 0)) as sim,
      ${genreMatch(genreSlug)} as "genreMatch",
      true as "titleMatch",
      false as "characterMatch"
    from anime a
    left join lateral (
      select max(similarity(title_value, ${raw})) as sim
      from jsonb_array_elements_text(a.extra -> 'titles') as titles(title_value)
    ) alt on true
    where ${CATALOG_READY}
      and (a.title % ${raw} or coalesce(alt.sim, 0) >= 0.3)
    order by "genreMatch" desc, sim desc, a.rating desc nulls last
    limit 20
  `)
  return resultRows<ScoredRow>(result)
}

async function searchByCharacterSimilarity(
  raw: string,
  match: string | null,
  genreSlug?: string,
): Promise<ScoredRow[]> {
  const result = await db().execute(sql`
    select
      ${SEARCH_COLUMNS},
      matches.sim,
      ${genreMatch(genreSlug)} as "genreMatch",
      ${titleMatch(match)} as "titleMatch",
      true as "characterMatch"
    from (
      select ch.anime_id, max(similarity(ch.name, ${raw})) as sim
      from characters ch
      where ch.name % ${raw}
      group by ch.anime_id
    ) matches
    join anime a on a.id = matches.anime_id
    where ${CATALOG_READY}
    order by "genreMatch" desc, "titleMatch" desc, matches.sim desc, a.rating desc nulls last
    limit 20
  `)
  return resultRows<ScoredRow>(result)
}

export async function searchAnime({ query, genreSlug }: SearchOptions): Promise<SearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const tokens = searchTokens(trimmed)
  const match = toFtsQuery(tokens)

  const groups = await Promise.all([
    match ? searchByFullText(match, genreSlug) : Promise.resolve([]),
    searchByTitleSimilarity(trimmed, genreSlug),
    searchByCharacterSimilarity(trimmed, match, genreSlug),
  ])
  const merged = mergeRows(groups)
  if (merged.length > 0) return merged

  const anyMatch = toAnyFtsQuery(tokens)
  if (!anyMatch) return []
  return mergeRows([await searchByFullText(anyMatch, genreSlug)])
}

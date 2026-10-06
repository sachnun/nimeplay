import { eq, or, type SQL, sql } from 'drizzle-orm'
import { anime } from '../../../database/schema'

export const PAGE_SIZE = 24

export const BLOCKED_GENRE_SLUGS = ['hentai']

const BLOCKED_GENRE_SLUGS_SQL = sql.join(
  BLOCKED_GENRE_SLUGS.map(slug => sql`${slug}`),
  sql`, `,
)

export function playableEpisodeExists(id: SQL): SQL {
  return sql`exists (select 1 from episodes e join anime_sources s on s.id = e.source_id where s.anime_id = ${id})`
}

export function notBlockedGenre(id: SQL): SQL {
  return sql`not exists (select 1 from anime_genres ag join genres g on g.id = ag.genre_id where ag.anime_id = ${id} and g.slug in (${BLOCKED_GENRE_SLUGS_SQL}))`
}

export const CATALOG_READY = sql`${anime.malId} is not null and ${playableEpisodeExists(sql`${anime.id}`)} and ${notBlockedGenre(sql`${anime.id}`)} and (${anime.status} is distinct from 'COMPLETED' or (${anime.extra} ->> 'episodeTotal') is null or ${anime.episodeCount} >= (${anime.extra} ->> 'episodeTotal')::int)`

const RECENT_EPISODE_SQL = sql`now() - interval '7 days'`

export function statusCondition(status: 'ONGOING' | 'COMPLETED') {
  return status === 'COMPLETED'
    ? eq(anime.status, 'COMPLETED')
    : or(eq(anime.status, 'ONGOING'), sql`${anime.latestEpisodeAt} >= ${RECENT_EPISODE_SQL}`)
}

export function formatSeason(season: string | null, year: number | null): string {
  if (!season) return year ? String(year) : ''
  const name = season.replace(/(^|\s)\S/g, part => part.toUpperCase())
  return year ? `${name} ${year}` : name
}

export const SEASON_RANK = sql`case
  when ${anime.season} = 'winter' then 1
  when ${anime.season} = 'spring' then 2
  when ${anime.season} = 'summer' then 3
  when ${anime.season} = 'fall' then 4
  else 0 end`

import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { anime } from '../../../database/schema'
import { posterSrc } from '../../media'
import { db } from '../index'
import { CATALOG_READY, PAGE_SIZE, SEASON_RANK, formatSeason, statusCondition } from './shared'
import type { AnimeCard } from '#shared/types'

async function getStatusCount(status: 'ONGOING' | 'COMPLETED'): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(anime)
    .where(and(statusCondition(status), CATALOG_READY))
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

  const rows = await db()
    .select({
      malId: anime.malId,
      title: sql<string>`coalesce(${anime.title}, '')`,
      posterKey: anime.posterKey,
      rating: anime.rating,
      day: anime.day,
      season: anime.season,
      year: anime.year,
      maxEpisode: sql<number | null>`(select max(e.number) from episodes e join anime_sources s on s.id = e.source_id where s.anime_id = ${sql.raw('"anime"."id"')})`,
      total: sql<number>`cast(count(*) over() as integer)`,
    })
    .from(anime)
    .where(filter)
    .orderBy(...orderBy)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  if (rows.length === 0) {
    const total = await getStatusCount(status)
    return { anime: [], totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
  }

  return {
    anime: rows.map(row => ({
      malId: row.malId!,
      title: row.title,
      thumbnail: posterSrc(row.posterKey),
      episode: row.maxEpisode ? `Episode ${row.maxEpisode}` : '',
      day: row.day ?? '',
      date: formatSeason(row.season, row.year),
      rating: row.rating != null ? String(row.rating) : undefined,
    })),
    totalPages: Math.max(1, Math.ceil(rows[0]!.total / PAGE_SIZE)),
  }
}

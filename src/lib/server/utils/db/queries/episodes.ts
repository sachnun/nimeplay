import { and, eq, sql } from 'drizzle-orm'
import { anime, animeSources, episodes } from '../../../database/schema'
import { db } from '../../db'
import { posterSrc } from '../../media'
import { sourceRank } from '../../sources'
import { notBlockedGenre } from './shared'

interface EpisodeCandidate {
  episodeSlug: string
  source: string
}

export async function resolveEpisode(
  malId: number,
  number: number,
): Promise<{ animeId: number; anime: { title: string; thumbnail: string }; candidates: EpisodeCandidate[] } | null> {
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
    .where(and(eq(anime.malId, malId), eq(episodes.number, number), notBlockedGenre(sql`${anime.id}`)))

  if (rows.length === 0) return null
  rows.sort((a, b) => sourceRank(a.source) - sourceRank(b.source))
  const first = rows[0]
  if (!first) return null
  return {
    animeId: first.animeId,
    anime: { title: first.title, thumbnail: posterSrc(first.posterKey) },
    candidates: rows.map(row => ({ episodeSlug: row.episodeSlug, source: row.source })),
  }
}

export async function getEpisodeNumbers(animeId: number): Promise<number[]> {
  const rows = await db()
    .select({ number: episodes.number })
    .from(episodes)
    .innerJoin(animeSources, eq(animeSources.id, episodes.sourceId))
    .where(eq(animeSources.animeId, animeId))

  const numbers = new Set<number>()
  for (const entry of rows) {
    numbers.add(entry.number)
  }
  return [...numbers].toSorted((a, b) => a - b)
}

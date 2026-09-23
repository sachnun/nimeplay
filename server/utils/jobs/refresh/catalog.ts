import { and, eq, inArray, sql } from 'drizzle-orm'
import { animeSources } from '../../../database/schema'
import { db } from '../../db'
import { getSources } from '../../sources'
import type { AnimeSource } from '../../sources/types'
import { parseEpisodeDate } from '../../sources/shared'
import { syncAnimeAggregate } from './persist'
import { getAppState, setAppState } from './state'
import { ok, warn } from '../../log'
import { chunkValues } from './util'

const VALID_DAYS = new Set(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'])

function attempt<T>(task: Promise<T>, onError: (error: unknown) => void): Promise<T | null> {
  return task.then(
    value => value,
    (error: unknown) => {
      onError(error)
      return null
    },
  )
}

async function registerOngoingCards(source: AnimeSource, sourceId: string, cards: { slug: string, day?: string, date?: string, status?: 'ONGOING' | 'COMPLETED', ongoingRank?: number }[]) {
  if (cards.length === 0) return
  const rows = cards.map(card => ({
    source: sourceId,
    slug: card.slug,
    url: `${source.baseUrl}/anime/${card.slug}/`,
    status: card.status ?? 'ONGOING',
    day: card.day && VALID_DAYS.has(card.day) ? card.day : null,
    latestEpisodeAt: card.date ? parseEpisodeDate(card.date) : null,
    ongoingRank: card.ongoingRank ?? null,
  }))
  const client = db()
  for (const chunk of chunkValues(rows, 10)) {
    await client.insert(animeSources).values(chunk).onConflictDoUpdate({
      target: [animeSources.source, animeSources.slug],
      set: {
        status: sql`excluded.status`,
        day: sql`coalesce(excluded.day, ${animeSources.day})`,
        latestEpisodeAt: sql`coalesce(excluded.latest_episode_at, ${animeSources.latestEpisodeAt})`,
        ongoingRank: sql`coalesce(excluded.ongoing_rank, ${animeSources.ongoingRank})`,
      },
    })
  }

  const touched = new Set<number>()
  for (const chunk of chunkValues(rows.map(row => row.slug), 200)) {
    const linked = await client
      .select({ animeId: animeSources.animeId })
      .from(animeSources)
      .where(and(eq(animeSources.source, sourceId), inArray(animeSources.slug, chunk)))
    for (const row of linked) {
      if (row.animeId) touched.add(row.animeId)
    }
  }
  for (const animeId of touched) await syncAnimeAggregate(animeId)
}

export async function backfillCompleted(source: AnimeSource): Promise<{ pages: number, registered: number }> {
  const key = `backfill:${source.id}`
  const cursor = await getAppState(key)
  if (cursor === 'done') return { pages: 0, registered: 0 }
  let page = Number(cursor) || 1
  if (page < 1) page = 1
  let totalPages = page
  let pages = 0
  let registered = 0
  while (page <= totalPages) {
    const result = await attempt(
      source.completedFresh(page),
      error => warn(`[catalog] ${source.id} completed page ${page} failed`, { error: error instanceof Error ? error.message : String(error) }),
    )
    if (result === null) break
    pages++
    totalPages = Math.max(1, result.totalPages)
    if (result.anime.length > 0) {
      const cards = result.anime.map(card => ({
        slug: card.slug,
        day: card.day,
        date: card.date,
        status: 'COMPLETED' as const,
      }))
      const done = await attempt(
        registerOngoingCards(source, source.id, cards),
        error => warn(`[catalog] ${source.id} completed register failed`, { error: error instanceof Error ? error.message : String(error) }),
      )
      if (done !== null) registered += result.anime.length
    }
    page++
  }
  await setAppState(key, page > totalPages ? 'done' : String(page))
  return { pages, registered }
}

export async function syncOngoingCatalog(): Promise<void> {
  let ongoingRank = 0
  for (const source of getSources()) {
    const cards: { slug: string, day: string, date: string, episode: string, status?: 'ONGOING' | 'COMPLETED', ongoingRank: number }[] = []
    const first = await attempt(
      source.ongoingFresh(1),
      error => warn(`[catalog] ${source.id} ongoing page 1 failed`, { error: error instanceof Error ? error.message : String(error) }),
    )
    if (first !== null && first.anime.length > 0) {
      for (const card of first.anime) {
        ongoingRank++
        cards.push({ slug: card.slug, day: card.day, date: card.date, episode: card.episode, status: card.status, ongoingRank })
      }
      const pages: number[] = []
      for (let page = 2; page <= first.totalPages; page++) pages.push(page)
      const restResults = await Promise.all(pages.map(page => attempt(
        source.ongoingFresh(page),
        error => warn(`[catalog] ${source.id} ongoing page ${page} failed`, { error: error instanceof Error ? error.message : String(error) }),
      )))
      for (const result of restResults) {
        if (result === null) continue
        for (const card of result.anime) {
          ongoingRank++
          cards.push({ slug: card.slug, day: card.day, date: card.date, episode: card.episode, status: card.status, ongoingRank })
        }
      }
    }
    await registerOngoingCards(source, source.id, cards)
    if (cards.length > 0) ok(`[catalog] ${source.id}: registered ${cards.length} ongoing cards`)
  }
}

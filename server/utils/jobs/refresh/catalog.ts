import { Effect } from 'effect'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { animeSources } from '../../../database/schema'
import { db } from '../../db'
import { ok, warn } from '../../log'
import { getSources } from '../../sources'
import { parseEpisodeDate } from '../../sources/shared'
import type { AnimeSource } from '../../sources/types'
import { syncAnimeAggregate } from './persist'
import { getAppState, setAppState } from './state'
import { chunkValues } from './util'

function attempt<T>(task: Promise<T>, onError: (error: unknown) => void): Promise<T | null> {
  return task.then(
    value => value,
    (error: unknown) => {
      onError(error)
      return null
    },
  )
}

async function registerOngoingCards(
  sourceId: string,
  cards: { slug: string; date?: string; status?: 'ONGOING' | 'COMPLETED'; ongoingRank?: number }[],
) {
  if (cards.length === 0) return
  const rows = cards.map(card => ({
    source: sourceId,
    slug: card.slug,
    status: card.status ?? 'ONGOING',
    latestEpisodeAt: card.date ? parseEpisodeDate(card.date) : null,
    ongoingRank: card.ongoingRank ?? null,
  }))
  const client = db()
  for (const chunk of chunkValues(rows, 10)) {
    await client
      .insert(animeSources)
      .values(chunk)
      .onConflictDoUpdate({
        target: [animeSources.source, animeSources.slug],
        set: {
          status: sql`excluded.status`,
          latestEpisodeAt: sql`coalesce(excluded.latest_episode_at, ${animeSources.latestEpisodeAt})`,
          ongoingRank: sql`coalesce(excluded.ongoing_rank, ${animeSources.ongoingRank})`,
        },
      })
  }

  const touched = new Set<number>()
  for (const chunk of chunkValues(
    rows.map(row => row.slug),
    200,
  )) {
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

export async function backfillCompleted(source: AnimeSource): Promise<{ pages: number; registered: number }> {
  const key = `backfill:${source.id}`
  const cursor = await getAppState(key)
  if (cursor === 'done') return { pages: 0, registered: 0 }
  let page = Number(cursor) || 1
  if (page < 1) page = 1
  let totalPages = page
  let pages = 0
  let registered = 0
  while (page <= totalPages) {
    const result = await attempt(source.completedFresh(page), error =>
      warn(`[catalog] ${source.id} completed page ${page} failed`, {
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    if (result === null) break
    pages++
    totalPages = Math.max(1, result.totalPages)
    if (result.anime.length > 0) {
      const cards = result.anime.map(card => ({
        slug: card.slug,
        date: card.date,
        status: 'COMPLETED' as const,
      }))
      const done = await attempt(registerOngoingCards(source.id, cards), error =>
        warn(`[catalog] ${source.id} completed register failed`, {
          error: error instanceof Error ? error.message : String(error),
        }),
      )
      if (done !== null) registered += result.anime.length
    }
    page++
  }
  await setAppState(key, page > totalPages ? 'done' : String(page))
  return { pages, registered }
}

type OngoingCard = { slug: string; date: string; status?: 'ONGOING' | 'COMPLETED'; ongoingRank: number }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function collectOngoing(source: AnimeSource): Promise<OngoingCard[]> {
  const cards: OngoingCard[] = []
  let ongoingRank = 0
  const push = (list: { slug: string; date: string; status?: 'ONGOING' | 'COMPLETED' }[]): void => {
    for (const card of list) {
      ongoingRank++
      cards.push({ slug: card.slug, date: card.date, status: card.status, ongoingRank })
    }
  }
  const first = await attempt(source.ongoingFresh(1), error =>
    warn(`[catalog] ${source.id} ongoing page 1 failed`, { error: errorMessage(error) }),
  )
  if (!first || first.anime.length === 0) return cards
  push(first.anime)
  const pages = Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) => index + 2)
  const rest = await Effect.runPromise(
    Effect.forEach(
      pages,
      page =>
        Effect.promise(() =>
          attempt(source.ongoingFresh(page), error =>
            warn(`[catalog] ${source.id} ongoing page ${page} failed`, { error: errorMessage(error) }),
          ),
        ),
      { concurrency: 3 },
    ),
  )
  for (const result of rest) if (result) push(result.anime)
  return cards
}

export async function syncOngoingCatalog(): Promise<void> {
  for (const source of getSources()) {
    const cards = await collectOngoing(source)
    await registerOngoingCards(source.id, cards)
    if (cards.length > 0) ok(`[catalog] ${source.id}: registered ${cards.length} ongoing cards`)
  }
}

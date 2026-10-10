import { Effect } from 'effect'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { animeSources } from '../../../database/schema'
import { db } from '../../db'
import { ok, warn } from '../../log'
import type { Http } from '../../net/http'
import { getSources } from '../../sources'
import { parseEpisodeDate } from '../../sources/shared'
import type { AnimeSource, ListResult, SourceEffect } from '../../sources/types'
import { syncAnimeAggregate } from './persist'
import { getAppState, setAppState } from './state'
import { chunkValues } from './util'

function logFailure(label: string, error: unknown): Effect.Effect<void> {
  return Effect.sync(() =>
    warn(`[catalog] ${label} failed`, {
      error: error instanceof Error ? error.message : String(error),
    }),
  )
}

function attempt(label: string, task: SourceEffect<ListResult>): Effect.Effect<ListResult | null, never, Http> {
  return task.pipe(Effect.catch(error => logFailure(label, error).pipe(Effect.as(null))))
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

export function backfillCompleted(source: AnimeSource): Effect.Effect<{ pages: number; registered: number }, never, Http> {
  return Effect.gen(function* () {
    const key = `backfill:${source.id}`
    const cursor = yield* Effect.promise(() => getAppState(key))
    if (cursor === 'done') return { pages: 0, registered: 0 }
    let page = Number(cursor) || 1
    if (page < 1) page = 1
    let totalPages = page
    let pages = 0
    let registered = 0
    while (page <= totalPages) {
      const result = yield* attempt(`${source.id} completed page ${page}`, source.completedFresh(page))
      if (result === null) break
      pages++
      totalPages = Math.max(1, result.totalPages)
      if (result.anime.length > 0) {
        const cards = result.anime.map(card => ({
          slug: card.slug,
          date: card.date,
          status: 'COMPLETED' as const,
        }))
        const done = yield* Effect.tryPromise({
          try: () => registerOngoingCards(source.id, cards),
          catch: error => error,
        }).pipe(
          Effect.catch(error => logFailure(`${source.id} completed register`, error).pipe(Effect.as(null))),
        )
        if (done !== null) registered += result.anime.length
      }
      page++
    }
    yield* Effect.promise(() => setAppState(key, page > totalPages ? 'done' : String(page)))
    return { pages, registered }
  })
}

type OngoingCard = { slug: string; date: string; status?: 'ONGOING' | 'COMPLETED'; ongoingRank: number }

function collectOngoing(source: AnimeSource): Effect.Effect<OngoingCard[], never, Http> {
  return Effect.gen(function* () {
    const cards: OngoingCard[] = []
    let ongoingRank = 0
    const push = (list: { slug: string; date: string; status?: 'ONGOING' | 'COMPLETED' }[]): void => {
      for (const card of list) {
        ongoingRank++
        cards.push({ slug: card.slug, date: card.date, status: card.status, ongoingRank })
      }
    }
    const first = yield* attempt(`${source.id} ongoing page 1`, source.ongoingFresh(1))
    if (!first || first.anime.length === 0) return cards
    push(first.anime)
    const pages = Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) => index + 2)
    const rest = yield* Effect.forEach(
      pages,
      page => attempt(`${source.id} ongoing page ${page}`, source.ongoingFresh(page)),
      { concurrency: 3 },
    )
    for (const result of rest) if (result) push(result.anime)
    return cards
  })
}

export function syncOngoingCatalog(): Effect.Effect<void, never, Http> {
  return Effect.gen(function* () {
    for (const source of getSources()) {
      const cards = yield* collectOngoing(source)
      yield* Effect.promise(() => registerOngoingCards(source.id, cards))
      if (cards.length > 0) yield* Effect.sync(() => ok(`[catalog] ${source.id}: registered ${cards.length} ongoing cards`))
    }
  })
}

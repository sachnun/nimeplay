import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { anime, animeGenres, episodes, genres, syncState } from '../database/schema'
import { db } from './db'
import { fetchMalAnime, malSearchVariants, rankMalAnimeMatches, searchMalAnimeEntries, seasonNumber } from './mal'
import { mirrorAnimeMedia } from './r2'
import { toR2Url } from './r2'
import { getSources, scrapeAnimeDetailFresh } from './sources'
import type { AnimeSource } from './sources/types'
import { parseEpisodeDate } from './sources/shared'

const TASK_WALL_MS = 100000
const LOCK_TTL_MS = 15 * 60 * 1000
const ROLLING_META_BUDGET = 5
const SEED_META_BUDGET = 10
const ONGOING_PAGES = 3
const COMPLETED_PAGES = 3
const ROLLING_FRESH_BUDGET = 8
const SEED_FRESH_BUDGET = 8
const ROLLING_UNKNOWN_BUDGET = 5
const SEED_UNKNOWN_BUDGET = 30
const REFRESH_CONCURRENCY = 2
const RETRY_MS = 24 * 60 * 60 * 1000
const BIND_CHUNK_SIZE = 40
const WRITE_CHUNK_SIZE = 100

export type CatalogMode = 'seed' | 'rolling'

export interface CatalogStats {
  mode: CatalogMode
  startedAt: string
  finishedAt: string
  durationMs: number
  sourcesRegistered: Record<string, number>
  freshRefreshed: number
  unknownRefreshed: number
  metadataPending: number
  metadataResolved: number
}

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size))
  return chunks
}

function attempt<T>(task: Promise<T>, onError: (error: unknown) => void): Promise<T | null> {
  return task.then(
    value => value,
    (error: unknown) => {
      onError(error)
      return null
    },
  )
}

async function runBatches<T>(
  items: T[],
  deadline: number,
  limit: number,
  label: string,
  run: (item: T) => Promise<unknown>,
): Promise<number> {
  let done = 0
  for (let i = 0; i < items.length && Date.now() < deadline; i += limit) {
    const results = await Promise.all(items.slice(i, i + limit).map(item => attempt(
      run(item),
      error => console.warn(`[catalog] ${label} failed:`, error instanceof Error ? error.message : error),
    )))
    done += results.filter(result => result !== null).length
  }
  return done
}

const VALID_DAYS = new Set(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'])

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function episodeNumber(titleOrSlug: string): number | null {
  const match = titleOrSlug.match(/episode-(\d+)/) ?? titleOrSlug.match(/episode\s+(\d+)/i)
  return match ? Number(match[1]) : null
}

function normalizeStatus(raw: string): string {
  const value = raw.toLowerCase()
  if (value.includes('completed') || value.includes('finished')) return 'COMPLETED'
  return 'ONGOING'
}

function parseOdYear(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.match(/(\d{4})/)
  if (!match) return null
  const year = Number(match[1])
  return year >= 1990 && year <= 2100 ? year : null
}

function recordFailure(slug: string, message: string): Promise<void> {
  return db()
    .update(anime)
    .set({
      metadataAttempts: sql`${anime.metadataAttempts} + 1`,
      metadataLastError: message.slice(0, 500),
      metadataRetryAt: new Date(Date.now() + RETRY_MS),
    })
    .where(eq(anime.slug, slug))
    .then(
      () => {},
      error => {
        console.warn(`[metadata] record failure failed ${slug}:`, error instanceof Error ? error.message : error)
      },
    )
}

async function acquireCatalogLock(mode: CatalogMode): Promise<string | null> {
  const key = `catalog:${mode}`
  const now = Date.now()
  const [current] = await db().select().from(syncState).where(eq(syncState.key, key)).limit(1)
  if (current && current.lockedUntil && current.lockedUntil.getTime() > now) return null
  const owner = `${now}-${Math.floor(Math.random() * 1e9)}`
  const lockedUntil = new Date(now + LOCK_TTL_MS)
  await db()
    .insert(syncState)
    .values({ key, owner, lockedUntil, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: syncState.key,
      set: { owner, lockedUntil, updatedAt: new Date() },
    })
  const [confirmed] = await db().select().from(syncState).where(eq(syncState.key, key)).limit(1)
  return confirmed?.owner === owner ? owner : null
}

async function releaseCatalogLock(mode: CatalogMode, owner: string): Promise<void> {
  const key = `catalog:${mode}`
  const [current] = await db().select().from(syncState).where(eq(syncState.key, key)).limit(1)
  if (!current || current.owner !== owner) return
  await db()
    .update(syncState)
    .set({ lockedUntil: new Date(0), updatedAt: new Date() })
    .where(eq(syncState.key, key))
}

export async function getCatalogHealth() {
  const [pending] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(anime)
    .where(isNull(anime.malId))
  const locks = await db().select().from(syncState)
  return {
    checkedAt: new Date().toISOString(),
    pendingMetadata: pending?.count ?? 0,
    locks: locks.map(entry => ({
      key: entry.key,
      locked: entry.lockedUntil ? entry.lockedUntil.getTime() > Date.now() : false,
      lockedUntil: entry.lockedUntil?.toISOString() ?? null,
      updatedAt: entry.updatedAt?.toISOString() ?? null,
    })),
    config: {
      ongoingPages: ONGOING_PAGES,
      completedPages: COMPLETED_PAGES,
      rollingMetaBudget: ROLLING_META_BUDGET,
      seedMetaBudget: SEED_META_BUDGET,
      rollingFreshBudget: ROLLING_FRESH_BUDGET,
      seedFreshBudget: SEED_FRESH_BUDGET,
      rollingUnknownBudget: ROLLING_UNKNOWN_BUDGET,
      seedUnknownBudget: SEED_UNKNOWN_BUDGET,
    },
  }
}

async function upsertEpisodes(
  animeSlug: string,
  list: { title: string, slug: string, date: string }[],
) {
  const sourcePrefix = `${animeSlug.split(':')[0]}:`
  const rows = list
    .map(entry => ({ entry, number: episodeNumber(entry.slug) ?? episodeNumber(entry.title) }))
    .filter((row): row is { entry: typeof list[number], number: number } => row.number !== null)

  if (rows.length === 0) return

  for (const chunk of chunkValues(rows, WRITE_CHUNK_SIZE)) {
    await db().insert(episodes).values(chunk.map(({ entry, number }) => ({
      animeSlug,
      slug: `${sourcePrefix}${entry.slug}`,
      number,
      title: entry.title,
      releaseDate: entry.date || null,
    }))).onConflictDoNothing()
  }
}

async function syncGenres(animeSlug: string, names: string[]) {
  if (names.length === 0) return

  const rows = names.map(name => ({
    slug: slugify(name),
    name,
  }))
  const wantedSlugs = [...new Set(rows.map(row => row.slug))]

  for (const chunk of chunkValues(rows, WRITE_CHUNK_SIZE)) {
    await db().insert(genres).values(chunk).onConflictDoNothing()
  }
  const stored = await db()
    .select({ id: genres.id, slug: genres.slug })
    .from(genres)
    .where(inArray(genres.slug, wantedSlugs))
  const bySlug = new Map(stored.map(genre => [genre.slug, genre.id]))

  const links = rows
    .map(row => bySlug.get(row.slug))
    .filter((id): id is number => id !== undefined)
    .map(id => ({ animeSlug, genreId: id }))

  await db().delete(animeGenres).where(eq(animeGenres.animeSlug, animeSlug))
  if (links.length === 0) return
  for (const chunk of chunkValues(links, WRITE_CHUNK_SIZE)) {
    await db().insert(animeGenres).values(chunk).onConflictDoNothing()
  }
}

async function applyMalMetadata(slug: string, mal: NonNullable<Awaited<ReturnType<typeof fetchMalAnime>>>) {
  const poster = mal.poster ? toR2Url(mal.poster, 'posters') : null
  const characters = mal.characters.map(c => ({
    ...c,
    imageUrl: toR2Url(c.imageUrl, 'characters'),
    voiceActor: c.voiceActor ? {
      ...c.voiceActor,
      imageUrl: toR2Url(c.voiceActor.imageUrl, 'voiceactors'),
    } : undefined,
  }))

  await db()
    .update(anime)
    .set({
      malId: mal.malId,
      synopsis: mal.synopsis,
      poster,
      rating: mal.score,
      rank: mal.rank,
      popularity: mal.popularity,
      season: mal.season && mal.year ? `${mal.season} ${mal.year}` : mal.season,
      trailerId: mal.trailerId,
      studio: mal.studio,
      source: mal.source,
      characters,
      metadataSyncedAt: new Date(),
      metadataAttempts: 0,
      metadataLastError: null,
      metadataRetryAt: null,
    })
    .where(eq(anime.slug, slug))
  await syncGenres(slug, mal.genres)
  await mirrorAnimeMedia(poster, characters)
}

async function resolveMetadata(slug: string, title: string): Promise<boolean> {
  const merged = new Map<number, { id: number, title: string }>()
  for (const variant of malSearchVariants(title)) {
    const batch = await searchMalAnimeEntries(variant)
    for (const entry of batch) {
      if (!merged.has(entry.id)) merged.set(entry.id, entry)
    }
    if (merged.size >= 15) break
  }
  const entries = [...merged.values()].slice(0, 15)
  const ranked = rankMalAnimeMatches(title, entries)
  if (ranked.length === 0) {
    const top = entries[0]?.title ?? '-'
    const reason = `no MAL title matches "${title}" (top: "${top}")`
    await recordFailure(slug, reason)
    console.warn(`[metadata] no MAL title matches "${title}" (top: "${top}")`)
    return false
  }

  let odYear: number | null | undefined
  const loadOdYear = (): Promise<number | null> => {
    if (odYear !== undefined) return Promise.resolve(odYear)
    return scrapeAnimeDetailFresh(slug).then(
      detail => odYear = parseOdYear(detail?.releaseDate ?? null),
      () => odYear = null,
    )
  }
  let yearFallback: { mal: NonNullable<Awaited<ReturnType<typeof fetchMalAnime>>>, diff: number } | null = null

  for (const candidate of ranked.slice(0, 6)) {
    const mal = await fetchMalAnime(candidate.id)
    if (!mal) {
      const reason = `MAL fetch returned empty for id ${candidate.id}`
      await recordFailure(slug, reason)
      console.warn(`[metadata] failed ${slug}: ${reason}`)
      continue
    }

    const siteSeason = seasonNumber(title)
    const candidateSeason = seasonNumber(candidate.title)
    if (siteSeason !== null && siteSeason > 1 && candidateSeason === null && mal.year !== null) {
      const expectedYear = await loadOdYear()
      if (expectedYear !== null && Math.abs(expectedYear - mal.year) > 1) {
        if (!yearFallback || Math.abs(expectedYear - mal.year) < yearFallback.diff) {
          yearFallback = { mal, diff: Math.abs(expectedYear - mal.year) }
        }
        continue
      }
    }

    const [owner] = await db()
      .select({ slug: anime.slug })
      .from(anime)
      .where(eq(anime.malId, mal.malId))
      .limit(1)
    if (owner && owner.slug !== slug) {
      const reason = `mal_id ${mal.malId} already owned by ${owner.slug}`
      await recordFailure(slug, reason)
      console.warn(`[metadata] mal_id ${mal.malId} already owned, skipping ${slug}`)
      return false
    }

    return applyMalMetadata(slug, mal).then(
      () => true,
      error => {
        const reason = error instanceof Error ? error.message : String(error)
        return recordFailure(slug, reason).then(() => {
          console.warn(`[metadata] failed ${slug}: ${reason}`)
          return false
        })
      },
    )
  }

  if (yearFallback) {
    const [owner] = await db()
      .select({ slug: anime.slug })
      .from(anime)
      .where(eq(anime.malId, yearFallback.mal.malId))
      .limit(1)
    if (!owner || owner.slug === slug) {
      return applyMalMetadata(slug, yearFallback.mal).then(
        () => true,
        error => {
          const reason = error instanceof Error ? error.message : String(error)
          return recordFailure(slug, reason).then(() => {
            console.warn(`[metadata] failed ${slug}: ${reason}`)
            return false
          })
        },
      )
    }
  }

  const reason = `no usable MAL candidate for "${title}"`
  await recordFailure(slug, reason)
  console.warn(`[metadata] failed ${slug}: ${reason}`)
  return false
}

export async function refreshAnimeBySlug(slug: string, title: string, refreshMetadata: boolean): Promise<void> {
  const detail = await scrapeAnimeDetailFresh(slug)
  if (detail) {
    const status = normalizeStatus(detail.status)
    const latestEpisodeAt = detail.episodes
      .map(entry => parseEpisodeDate(entry.date))
      .filter((date): date is Date => date !== null)
      .reduce<Date | null>((latest, date) => (!latest || date > latest ? date : latest), null)
    const [beforeRow] = await db()
      .select({ max: sql<number | null>`max(${episodes.number})` })
      .from(episodes)
      .where(eq(episodes.animeSlug, slug))
    const maxBefore = Number(beforeRow?.max ?? 0)
    await upsertEpisodes(slug, detail.episodes)
    const maxInDetail = detail.episodes.reduce((max, entry) => {
      const parsed = episodeNumber(entry.slug) ?? episodeNumber(entry.title)
      return parsed != null && parsed > max ? parsed : max
    }, 0)
    const maxAfter = Math.max(maxBefore, maxInDetail)
    await db()
      .update(anime)
      .set({
        title: detail.title || title,
        status,
        ...(status === 'COMPLETED' ? { day: null, ongoingRank: null } : {}),
        ...(latestEpisodeAt ? { latestEpisodeAt } : {}),
        ...(maxAfter > maxBefore ? { lastNewEpisodeAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(anime.slug, slug))
  }
  if (refreshMetadata) await resolveMetadata(slug, title)
}

interface CatalogCard {
  source: AnimeSource
  slug: string
  title: string
  day?: string
  date?: string
  episode?: string
  ongoingRank?: number
}

async function registerCatalogCards(cards: CatalogCard[], status: 'ONGOING' | 'COMPLETED') {
  if (cards.length === 0) return
  const rows = cards.map(card => ({
    slug: `${card.source.id}:${card.slug}`,
    title: card.title,
    status,
    day: status === 'ONGOING' && card.day && VALID_DAYS.has(card.day) ? card.day : null,
    latestEpisodeAt: card.date ? parseEpisodeDate(card.date) : null,
    ongoingRank: status === 'ONGOING' ? card.ongoingRank ?? null : null,
    sourceUrl: `${card.source.baseUrl}/anime/${card.slug}/`,
  }))
  for (const chunk of chunkValues(rows, WRITE_CHUNK_SIZE)) {
    await db().insert(anime).values(chunk).onConflictDoUpdate({
      target: anime.slug,
      set: {
        status: sql`excluded.status`,
        day: sql`coalesce(excluded.day, ${anime.day})`,
        latestEpisodeAt: sql`coalesce(excluded.latest_episode_at, latest_episode_at)`,
        ongoingRank: sql`coalesce(excluded.ongoing_rank, ${anime.ongoingRank})`,
      },
    })
  }
}

async function scrapeSourcePages(
  source: AnimeSource,
  kind: 'ongoing' | 'completed',
  pages: number,
  ongoingRankStart: number,
): Promise<{ cards: CatalogCard[], nextRank: number }> {
  const fetchPage = kind === 'ongoing' ? source.ongoingFresh : source.completedFresh
  const cards: CatalogCard[] = []
  let rank = ongoingRankStart
  const first = await attempt(
    fetchPage(1),
    error => console.warn(`[catalog] ${source.id} ${kind} page 1 failed:`, error instanceof Error ? error.message : error),
  )
  if (first === null || first.anime.length === 0) return { cards, nextRank: rank }
  const push = (list: typeof first.anime) => {
    for (const card of list) {
      rank++
      cards.push({
        source,
        slug: card.slug,
        title: card.title,
        day: card.day,
        date: card.date,
        episode: card.episode,
        ongoingRank: kind === 'ongoing' ? rank : undefined,
      })
    }
  }
  push(first.anime)
  const rest: number[] = []
  for (let page = 2; page <= Math.min(pages, first.totalPages); page++) rest.push(page)
  const restResults = await Promise.all(rest.map(page => attempt(
    fetchPage(page),
    error => console.warn(`[catalog] ${source.id} ${kind} page ${page} failed:`, error instanceof Error ? error.message : error),
  )))
  for (const result of restResults) {
    if (result === null) continue
    push(result.anime)
  }
  return { cards, nextRank: rank }
}

async function refreshFreshEpisodes(
  cards: { slug: string, title: string, episode: string }[],
  deadline: number,
  budget: number,
): Promise<number> {
  const bySlug = new Map<string, { slug: string, title: string, episode: number }>()
  for (const card of cards) {
    const parsed = episodeNumber(card.episode)
    if (parsed == null) continue
    const current = bySlug.get(card.slug)
    if (!current || parsed > current.episode) bySlug.set(card.slug, { slug: card.slug, title: card.title, episode: parsed })
  }
  const wanted = [...bySlug.values()]
  if (wanted.length === 0) return 0
  const dbMax = new Map<string, number>()
  const maxResults = await Promise.all(chunkValues(wanted, BIND_CHUNK_SIZE).map(chunk =>
    db()
      .select({ slug: episodes.animeSlug, max: sql<number>`max(${episodes.number})` })
      .from(episodes)
      .where(inArray(episodes.animeSlug, chunk.map(item => item.slug)))
      .groupBy(episodes.animeSlug),
  ))
  for (const rows of maxResults) {
    for (const row of rows) {
      dbMax.set(row.slug, Number(row.max ?? 0))
    }
  }
  const todo = wanted
    .filter(item => item.episode > (dbMax.get(item.slug) ?? 0))
    .slice(0, budget)
  const refreshed = await runBatches(todo, deadline, REFRESH_CONCURRENCY, 'fresh episode refresh', item => refreshAnimeBySlug(item.slug, item.title, false))
  if (refreshed > 0) {
    console.log(`[catalog] fresh episodes: ${refreshed} refreshed`)
  }
  return refreshed
}

async function refreshUnknownSlugs(
  cards: { slug: string, title: string }[],
  deadline: number,
  budget: number,
): Promise<number> {
  const unique = [...new Map(cards.map(card => [card.slug, card])).values()]
  if (unique.length === 0) return 0
  const withEpisodes = new Set<string>()
  const results = await Promise.all(chunkValues(unique, BIND_CHUNK_SIZE).map(chunk =>
    db()
      .select({ slug: episodes.animeSlug })
      .from(episodes)
      .where(inArray(episodes.animeSlug, chunk.map(item => item.slug)))
      .groupBy(episodes.animeSlug),
  ))
  for (const rows of results) {
    for (const row of rows) withEpisodes.add(row.slug)
  }
  const todo = unique.filter(item => !withEpisodes.has(item.slug)).slice(0, budget)
  const refreshed = await runBatches(todo, deadline, REFRESH_CONCURRENCY, 'unknown refresh', item => refreshAnimeBySlug(item.slug, item.title, false))
  if (refreshed > 0) {
    console.log(`[catalog] unknown episodes: ${refreshed} refreshed`)
  }
  return refreshed
}

async function resolvePendingMetadata(deadline: number, budget: number): Promise<{ pending: number, resolved: number }> {
  const now = new Date()
  const eligibleWhere = and(isNull(anime.malId), or(isNull(anime.metadataRetryAt), lt(anime.metadataRetryAt, now)))
  const [totalResult] = await db().select({ count: sql<number>`count(*)` }).from(anime).where(isNull(anime.malId))
  const totalPending = totalResult?.count ?? 0

  const pending = await db()
    .select({ slug: anime.slug, title: anime.title })
    .from(anime)
    .where(eligibleWhere)
    .orderBy(sql`case when ${anime.status} = 'ONGOING' then 0 else 1 end`, sql`${anime.ongoingRank} asc nulls last`, asc(anime.updatedAt))
    .limit(budget)
  console.log(`[catalog] ${totalPending} rows need MAL metadata, processing ${pending.length}`)
  let resolved = 0
  for (const row of pending) {
    if (Date.now() > deadline) break
    const ok = await attempt(
      resolveMetadata(row.slug, row.title),
      error => console.warn(`[catalog] metadata deferred ${row.slug}:`, error instanceof Error ? error.message : error),
    )
    if (ok) {
      resolved++
      console.log(`[catalog] metadata resolved: ${row.slug}`)
    }
  }
  return { pending: totalPending, resolved }
}

export async function runCatalogSync(mode: CatalogMode): Promise<CatalogStats> {
  const startedAt = new Date()
  const deadline = startedAt.getTime() + TASK_WALL_MS
  const owner = await acquireCatalogLock(mode)
  if (!owner) throw new Error(`catalog sync "${mode}" already running`)
  const stats: CatalogStats = {
    mode,
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    durationMs: 0,
    sourcesRegistered: {},
    freshRefreshed: 0,
    unknownRefreshed: 0,
    metadataPending: 0,
    metadataResolved: 0,
  }
  try {
    const freshBudget = mode === 'seed' ? SEED_FRESH_BUDGET : ROLLING_FRESH_BUDGET
    const unknownBudget = mode === 'seed' ? SEED_UNKNOWN_BUDGET : ROLLING_UNKNOWN_BUDGET
    const metaBudget = mode === 'seed' ? SEED_META_BUDGET : ROLLING_META_BUDGET
    const allCards: { source: AnimeSource, slug: string, title: string, episode: string }[] = []
    let ongoingRank = 0

    if (mode === 'seed') {
      for (const source of getSources()) {
        const { cards, nextRank } = await scrapeSourcePages(source, 'completed', COMPLETED_PAGES, ongoingRank)
        ongoingRank = nextRank
        await attempt(
          registerCatalogCards(cards, 'COMPLETED'),
          error => console.warn(`[catalog] ${source.id} register failed:`, error instanceof Error ? error.message : error),
        )
        stats.sourcesRegistered[`${source.id}:completed`] = cards.length
        console.log(`[catalog] ${source.id}: registered ${cards.length} completed cards`)
      }
    }

    for (const source of getSources()) {
      if (Date.now() > deadline) break
      const { cards, nextRank } = await scrapeSourcePages(source, 'ongoing', ONGOING_PAGES, ongoingRank)
      ongoingRank = nextRank
      await attempt(
        registerCatalogCards(cards, 'ONGOING'),
        error => console.warn(`[catalog] ${source.id} register failed:`, error instanceof Error ? error.message : error),
      )
      allCards.push(...cards.map(card => ({ source: card.source, slug: `${card.source.id}:${card.slug}`, title: card.title, episode: card.episode ?? '' })))
      stats.sourcesRegistered[`${source.id}:ongoing`] = cards.length
      console.log(`[catalog] ${source.id}: registered ${cards.length} ongoing cards`)
    }

    stats.freshRefreshed = await refreshFreshEpisodes(allCards, deadline, freshBudget)
    stats.unknownRefreshed = await refreshUnknownSlugs(
      allCards.map(item => ({ slug: item.slug, title: item.title })),
      deadline,
      unknownBudget,
    )

    const meta = await resolvePendingMetadata(deadline, metaBudget)
    stats.metadataPending = meta.pending
    stats.metadataResolved = meta.resolved
    return stats
  }
  finally {
    stats.finishedAt = new Date().toISOString()
    stats.durationMs = Date.now() - startedAt.getTime()
    await releaseCatalogLock(mode, owner)
  }
}

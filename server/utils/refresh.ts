import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { anime, animeGenres, appState, characters, episodes, genres, media } from '../database/schema'
import { db } from './db'
import { fetchMalAnime, malSearchVariants, rankMalAnimeMatches, searchMalAnimeEntries, seasonNumber } from './mal'
import { isValidMediaKey, mediaRef, type MediaRef } from './media'
import { getSources, scrapeAnimeDetailFresh, splitSource } from './sources'
import { enqueueMany } from './queue'
import type { AnimeSource } from './sources/types'
import { parseEpisodeDate } from './sources/shared'

const METADATA_REFRESH_MS = 7 * 24 * 60 * 60 * 1000
const BIND_CHUNK_SIZE = 40

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

const SYNC_STALE_MS = 4 * 60 * 1000
const syncStartedAt = new Map<string, number>()

function acquireSync(name: string): boolean {
  const startedAt = syncStartedAt.get(name)
  if (startedAt !== undefined && Date.now() - startedAt < SYNC_STALE_MS) return false
  syncStartedAt.set(name, Date.now())
  return true
}

function releaseSync(name: string): void {
  syncStartedAt.delete(name)
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

async function getAppState(key: string): Promise<string | null> {
  const [row] = await db()
    .select({ value: appState.value })
    .from(appState)
    .where(eq(appState.key, key))
    .limit(1)
  return row?.value ?? null
}

async function setAppState(key: string, value: string): Promise<void> {
  try {
    await db().execute(sql`insert into app_state (key, value, updated_at)
      values (${key}, ${value}, now())
      on conflict (key) do update set value = ${value}, updated_at = now()`)
  }
  catch (error) {
    const cause = (error as { cause?: unknown }).cause
    console.warn('[state] write failed:', error instanceof Error ? error.message : error, cause instanceof Error ? cause.message : cause)
    throw error
  }
}

function recordFailure(slug: string, message: string): Promise<void> {
  console.warn(`[metadata] failed ${slug}: ${message}`)
  return Promise.resolve()
}

async function loadMaxMap(slugs: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const results = await Promise.all(chunkValues(slugs, BIND_CHUNK_SIZE).map(chunk =>
    db()
      .select({ slug: anime.slug, max: sql<number | null>`max(${episodes.number})` })
      .from(anime)
      .leftJoin(episodes, eq(episodes.animeId, anime.id))
      .where(inArray(anime.slug, chunk))
      .groupBy(anime.id),
  ))
  for (const rows of results) {
    for (const row of rows) map.set(row.slug, Number(row.max ?? 0))
  }
  return map
}

interface AnimeRefreshState {
  id: number
  max: number
  malId: number | null
  status: string | null
  metadataSyncedAt: Date | null
}

async function upsertEpisodes(
  animeId: number,
  animeSlug: string,
  list: { title: string, slug: string, date: string }[],
  updates: Partial<typeof anime.$inferInsert>,
) {
  const split = splitSource(animeSlug)
  if (!split) return
  const sourcePrefix = `${split.source.id}:`
  const rows = list
    .map(entry => ({ entry, number: episodeNumber(entry.slug) ?? episodeNumber(entry.title) }))
    .filter((row): row is { entry: typeof list[number], number: number } => row.number !== null)

  const client = db()
  for (const chunk of chunkValues(rows, 15)) {
    await client.insert(episodes).values(chunk.map(({ entry, number }) => ({
      animeId,
      slug: `${sourcePrefix}${entry.slug}`,
      number,
      title: entry.title,
      releaseDate: entry.date || null,
    }))).onConflictDoNothing()
  }
  await client.update(anime).set({
    ...updates,
    episodeCount: sql<number>`(select cast(count(*) as integer) from ${episodes} where ${episodes.animeId} = ${animeId})`,
    latestEpisode: sql<number | null>`(select max(${episodes.number}) from ${episodes} where ${episodes.animeId} = ${animeId})`,
  }).where(eq(anime.id, animeId))
}

async function syncGenres(animeId: number, names: string[]) {
  if (names.length === 0) return

  const rows = names.map(name => ({
    slug: slugify(name),
    name,
  }))
  const wantedSlugs = [...new Set(rows.map(row => row.slug))]

  const client = db()
  for (const chunk of chunkValues(rows, 30)) {
    await client.insert(genres).values(chunk).onConflictDoNothing()
  }
  const stored = await db()
    .select({ id: genres.id, slug: genres.slug })
    .from(genres)
    .where(inArray(genres.slug, wantedSlugs))
  const bySlug = new Map(stored.map(genre => [genre.slug, genre.id]))

  const links = rows
    .map(row => bySlug.get(row.slug))
    .filter((id): id is number => id !== undefined)
    .map(id => ({ animeId, genreId: id }))

  const writeClient = db()
  await writeClient.delete(animeGenres).where(eq(animeGenres.animeId, animeId))
  for (const chunk of chunkValues(links, 30)) {
    await writeClient.insert(animeGenres).values(chunk).onConflictDoNothing()
  }
}

export async function applyMalMetadata(slug: string, mal: NonNullable<Awaited<ReturnType<typeof fetchMalAnime>>>) {
  const [target] = await db().select({ id: anime.id }).from(anime).where(eq(anime.slug, slug)).limit(1)
  if (!target) return
  const animeId = target.id

  const posterRef = mediaRef(mal.poster, 'posters')
  const characterRefs = mal.characters.map(c => mediaRef(c.imageUrl, 'characters'))
  const refs = [posterRef, ...characterRefs].filter((ref): ref is MediaRef => ref !== null && isValidMediaKey(ref.key))
  const wanted = [...new Map(refs.map(ref => [ref.sourceUrl, ref])).values()]
  const mirrored = wanted.length > 0
    ? await db().select({ sourceUrl: media.sourceUrl, key: media.key }).from(media).where(inArray(media.sourceUrl, wanted.map(ref => ref.sourceUrl)))
    : []
  const mirroredKeys = new Map(mirrored.map(row => [row.sourceUrl, row.key]))
  await enqueueMany(wanted
    .filter(ref => !mirroredKeys.has(ref.sourceUrl))
    .map(ref => ({
      type: 'media.mirror',
      payload: { key: ref.key, sourceUrl: ref.sourceUrl },
      dedupeKey: `media.mirror:${ref.sourceUrl}`,
      priority: 0,
      maxAttempts: 3,
    })))
  const imageKey = (ref: MediaRef | null): string | null => (ref ? (mirroredKeys.get(ref.sourceUrl) ?? ref.key) : null)

  const posterKey = imageKey(posterRef)

  const characterRows = mal.characters.map((c, index) => ({
    animeId,
    malId: null,
    name: c.name,
    role: c.role,
    imageKey: imageKey(characterRefs[index] ?? null),
    voiceActorName: c.voiceActor?.name ?? null,
    voiceActorKey: null,
    sortOrder: index,
  }))

  await db()
    .update(anime)
    .set({
      malId: mal.malId,
      ...(mal.title ? { title: mal.title } : {}),
      synopsis: mal.synopsis,
      ...(posterKey ? { posterKey } : {}),
      rating: mal.score,
      rank: mal.rank,
      popularity: mal.popularity,
      season: mal.season,
      year: mal.year,
      trailerId: mal.trailerId,
      studio: mal.studio,
      source: mal.source,
      extra: { episodeTotal: mal.episodeTotal },
      metadataSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(anime.id, animeId))

  await db().delete(characters).where(eq(characters.animeId, animeId))
  for (const chunk of chunkValues(characterRows, 50)) {
    await db().insert(characters).values(chunk).onConflictDoNothing()
  }
  await syncGenres(animeId, mal.genres)
}

async function refreshLinkedMalMetadata(slug: string, malId: number): Promise<boolean> {
  const mal = await fetchMalAnime(malId)
  if (!mal) {
    console.warn(`[metadata] linked refresh empty ${slug} mal ${malId}`)
    return false
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
  try {
    await applyMalMetadata(slug, mal)
    return true
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await recordFailure(slug, reason)
    console.warn(`[metadata] linked refresh failed ${slug}: ${reason}`)
    return false
  }
}

export async function resolveAnimeMetadata(slug: string, providedTitle?: string, providedDetail?: Awaited<ReturnType<typeof scrapeAnimeDetailFresh>> | null): Promise<boolean> {
  let detailPromise: Promise<Awaited<ReturnType<typeof scrapeAnimeDetailFresh>>> | undefined
  if (providedDetail !== undefined) detailPromise = Promise.resolve(providedDetail)
  const loadDetail = () => (detailPromise ??= scrapeAnimeDetailFresh(slug).catch(() => null))
  const title = (providedTitle || (await loadDetail())?.title || '').trim()
  if (!title) {
    await recordFailure(slug, 'no scraped title')
    return false
  }
  const merged = new Map<number, { id: number, title: string }>()
  const search = async (variants: string[]): Promise<void> => {
    for (const variant of variants) {
      const batch = await searchMalAnimeEntries(variant)
      for (const entry of batch) {
        if (!merged.has(entry.id)) merged.set(entry.id, entry)
      }
      if (merged.size > 0) break
    }
  }
  await search(malSearchVariants(title))
  let ranked = rankMalAnimeMatches(title, [...merged.values()].slice(0, 15))
  const japanese = (await loadDetail())?.japanese
  if (ranked.length === 0 && japanese) {
    await search(malSearchVariants(japanese))
    ranked = rankMalAnimeMatches(title, [...merged.values()].slice(0, 15))
  }
  if (ranked.length === 0) {
    const top = [...merged.values()][0]?.title ?? '-'
    const reason = `no MAL title matches "${title}" (top: "${top}")`
    await recordFailure(slug, reason)
    console.warn(`[metadata] no MAL title matches "${title}" (top: "${top}")`)
    return false
  }

  let odYear: number | null | undefined
  const loadOdYear = (): Promise<number | null> => {
    if (odYear !== undefined) return Promise.resolve(odYear)
    return loadDetail().then(detail => odYear = parseOdYear(detail?.releaseDate ?? null))
  }
  let yearFallback: { mal: NonNullable<Awaited<ReturnType<typeof fetchMalAnime>>>, diff: number } | null = null

  for (const candidate of ranked.slice(0, 3)) {
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

export async function refreshAnimeBySlug(slug: string, refreshMetadata: boolean, known?: AnimeRefreshState): Promise<void> {
  let state = known
  if (!state) {
    const [row] = await db()
      .select({ id: anime.id, malId: anime.malId, status: anime.status, metadataSyncedAt: anime.metadataSyncedAt })
      .from(anime)
      .where(eq(anime.slug, slug))
      .limit(1)
    state = {
      id: row?.id ?? -1,
      max: -1,
      malId: row?.malId ?? null,
      status: row?.status ?? null,
      metadataSyncedAt: row?.metadataSyncedAt ?? null,
    }
  }
  const animeRow = state
  const detail = await scrapeAnimeDetailFresh(slug)
  let hasNewEpisodes = false
  let statusChanged = false
  if (detail) {
    const status = normalizeStatus(detail.status)
    const latestEpisodeAt = detail.episodes
      .map(entry => parseEpisodeDate(entry.date))
      .filter((date): date is Date => date !== null)
      .reduce<Date | null>((latest, date) => (!latest || date > latest ? date : latest), null)
    const maxBefore = animeRow.max >= 0 ? animeRow.max : (await loadMaxMap([slug])).get(slug) ?? 0
    const maxInDetail = detail.episodes.reduce((max, entry) => {
      const parsed = episodeNumber(entry.slug) ?? episodeNumber(entry.title)
      return parsed != null && parsed > max ? parsed : max
    }, 0)
    hasNewEpisodes = Math.max(maxBefore, maxInDetail) > maxBefore
    statusChanged = animeRow.status != null && animeRow.status !== status
    await upsertEpisodes(animeRow.id, slug, detail.episodes, {
      status,
      ...(status === 'COMPLETED' ? { day: null, ongoingRank: null } : {}),
      ...(latestEpisodeAt ? { latestEpisodeAt } : {}),
      ...(hasNewEpisodes ? { lastNewEpisodeAt: new Date() } : {}),
      updatedAt: new Date(),
    })
  }
  const linkedMalId = animeRow.malId
  const metadataStale = !animeRow.metadataSyncedAt || Date.now() - animeRow.metadataSyncedAt.getTime() > METADATA_REFRESH_MS
  if (linkedMalId) {
    if (statusChanged || (metadataStale && (hasNewEpisodes || refreshMetadata))) {
      await refreshLinkedMalMetadata(slug, linkedMalId)
    }
  }
  else if (refreshMetadata) {
    await resolveAnimeMetadata(slug, detail?.title, detail)
  }
}

async function registerOngoingCards(cards: { source: AnimeSource, slug: string, day?: string, date?: string, status?: 'ONGOING' | 'COMPLETED', ongoingRank?: number }[]) {
  if (cards.length === 0) return
  const rows = cards.map(card => ({
    slug: `${card.source.id}:${card.slug}`,
    status: card.status ?? 'ONGOING',
    day: card.day && VALID_DAYS.has(card.day) ? card.day : null,
    latestEpisodeAt: card.date ? parseEpisodeDate(card.date) : null,
    ongoingRank: card.ongoingRank ?? null,
    sourceUrl: `${card.source.baseUrl}/anime/${card.slug}/`,
  }))
  const client = db()
  for (const chunk of chunkValues(rows, 10)) {
    await client.insert(anime).values(chunk).onConflictDoUpdate({
      target: anime.slug,
      set: {
        status: sql`excluded.status`,
        day: sql`coalesce(excluded.day, ${anime.day})`,
        latestEpisodeAt: sql`coalesce(excluded.latest_episode_at, ${anime.latestEpisodeAt})`,
        ongoingRank: sql`coalesce(excluded.ongoing_rank, ${anime.ongoingRank})`,
      },
    })
  }
}

async function backfillCompleted(source: AnimeSource): Promise<{ pages: number, registered: number }> {
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
      error => console.warn(`[catalog] ${source.id} completed page ${page} failed:`, error instanceof Error ? error.message : error),
    )
    if (result === null) break
    pages++
    totalPages = Math.max(1, result.totalPages)
    if (result.anime.length > 0) {
      const cards = result.anime.map(card => ({
        source,
        slug: card.slug,
        day: card.day,
        date: card.date,
        status: 'COMPLETED' as const,
      }))
      const done = await attempt(
        registerOngoingCards(cards),
        error => console.warn(`[catalog] ${source.id} completed register failed:`, error instanceof Error ? error.message : error),
      )
      if (done !== null) registered += result.anime.length
    }
    page++
  }
  await setAppState(key, page > totalPages ? 'done' : String(page))
  return { pages, registered }
}

async function syncOngoingCatalog(): Promise<void> {
  let ongoingRank = 0
  for (const source of getSources()) {
    const cards: { source: AnimeSource, slug: string, day: string, date: string, episode: string, status?: 'ONGOING' | 'COMPLETED', ongoingRank: number }[] = []
    const first = await attempt(
      source.ongoingFresh(1),
      error => console.warn(`[catalog] ${source.id} ongoing page 1 failed:`, error instanceof Error ? error.message : error),
    )
    if (first !== null && first.anime.length > 0) {
      for (const card of first.anime) {
        ongoingRank++
        cards.push({ source, slug: card.slug, day: card.day, date: card.date, episode: card.episode, status: card.status, ongoingRank })
      }
      const pages: number[] = []
      for (let page = 2; page <= first.totalPages; page++) pages.push(page)
      const restResults = await Promise.all(pages.map(page => attempt(
        source.ongoingFresh(page),
        error => console.warn(`[catalog] ${source.id} ongoing page ${page} failed:`, error instanceof Error ? error.message : error),
      )))
      for (const result of restResults) {
        if (result === null) continue
        for (const card of result.anime) {
          ongoingRank++
          cards.push({ source, slug: card.slug, day: card.day, date: card.date, episode: card.episode, status: card.status, ongoingRank })
        }
      }
    }
    const registered = await attempt(
      registerOngoingCards(cards),
      error => console.warn(`[catalog] ${source.id} register failed:`, error instanceof Error ? error.message : error),
    )
    if (registered !== null) console.log(`[catalog] ${source.id}: registered ${cards.length} ongoing cards`)
  }
}

export async function runOngoingSync(): Promise<void> {
  if (!acquireSync('catalog')) return
  try {
    await syncOngoingCatalog()
  }
  catch (error) {
    console.warn('[ongoing] sync failed:', error instanceof Error ? error.message : error)
  }
  finally {
    releaseSync('catalog')
  }
}

export async function runBackfill(sourceId: string): Promise<void> {
  const source = getSources().find(item => item.id === sourceId)
  if (!source) return
  if (!acquireSync(`backfill:${sourceId}`)) return
  try {
    const result = await backfillCompleted(source)
    if (result.registered > 0) console.log(`[backfill] ${sourceId}: +${result.registered}`)
  }
  catch (error) {
    console.warn(`[backfill] ${sourceId} failed:`, error instanceof Error ? error.message : error)
  }
  finally {
    releaseSync(`backfill:${sourceId}`)
  }
}


import { and, eq, inArray, sql } from 'drizzle-orm'
import { anime, animeGenres, animeSources, appState, characters, episodes, genres, media } from '../database/schema'
import type { AnimeSourceRow } from '../database/schema'
import { db } from './db'
import { fetchMalAnime, malSearchVariants, rankMalAnimeMatches, searchMalAnimeEntries, seasonNumber } from './mal'
import type { MalAnime, MalSearchEntry } from './mal'
import { isValidMediaKey, mediaRef, type MediaRef } from './media'
import { getSources, splitSource } from './sources'
import type { AnimeSource, ScrapedAnimeDetail } from './sources/types'
import { enqueueMany } from './queue'
import { parseEpisodeDate } from './sources/shared'

const METADATA_REFRESH_MS = 7 * 24 * 60 * 60 * 1000
const SYNC_STALE_MS = 4 * 60 * 1000
const VALID_DAYS = new Set(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'])

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
  await db().execute(sql`insert into app_state (key, value, updated_at)
    values (${key}, ${value}, now())
    on conflict (key) do update set value = ${value}, updated_at = now()`)
}

function recordFailure(slug: string, message: string): Promise<void> {
  console.warn(`[metadata] failed ${slug}: ${message}`)
  return Promise.resolve()
}

async function loadSourceMax(sourceId: number): Promise<number> {
  const [row] = await db()
    .select({ max: sql<number | null>`max(${episodes.number})` })
    .from(episodes)
    .where(eq(episodes.sourceId, sourceId))
  return Number(row?.max ?? 0)
}

async function getSourceRow(sourceId: string, vendorSlug: string): Promise<AnimeSourceRow | null> {
  const [row] = await db()
    .select()
    .from(animeSources)
    .where(and(eq(animeSources.source, sourceId), eq(animeSources.slug, vendorSlug)))
    .limit(1)
  return row ?? null
}

async function upsertEpisodes(source: AnimeSource, sourceId: number, list: { title: string, slug: string, date: string }[]): Promise<void> {
  const rows = list
    .map(entry => ({ entry, number: episodeNumber(entry.slug) ?? episodeNumber(entry.title) }))
    .filter((row): row is { entry: typeof list[number], number: number } => row.number !== null)

  const client = db()
  for (const chunk of chunkValues(rows, 15)) {
    await client.insert(episodes).values(chunk.map(({ entry, number }) => ({
      sourceId,
      slug: `${source.id}:${entry.slug}`,
      number,
      title: entry.title,
      releaseDate: entry.date || null,
    }))).onConflictDoNothing()
  }
}

async function syncAnimeAggregate(animeId: number): Promise<void> {
  const client = db()
  await client.execute(sql`
    update anime a set
      episode_count = coalesce(e.count, 0),
      latest_episode = e.max,
      updated_at = now()
    from (
      select count(distinct ep.number) as count, max(ep.number) as max
      from episodes ep
      join anime_sources s on s.id = ep.source_id
      where s.anime_id = ${animeId}
    ) e
    where a.id = ${animeId}
  `)
  await client.execute(sql`
    update anime a set
      status = case when s.status = 'ONGOING' then 'ONGOING' when s.status = 'COMPLETED' then 'COMPLETED' else a.status end,
      day = coalesce(s.day, a.day),
      ongoing_rank = coalesce(s.rank, a.ongoing_rank),
      latest_episode_at = greatest(a.latest_episode_at, s.latest_at),
      updated_at = now()
    from (
      select
        case when count(*) filter (where status = 'ONGOING') > 0 then 'ONGOING'
             when count(*) filter (where status = 'COMPLETED') > 0 then 'COMPLETED' end as status,
        min(ongoing_rank) as rank,
        max(latest_episode_at) as latest_at,
        (array_agg(day order by ongoing_rank asc nulls last, updated_at desc) filter (where day is not null))[1] as day
      from anime_sources
      where anime_id = ${animeId}
    ) s
    where a.id = ${animeId}
  `)
}

async function syncGenres(animeId: number, names: string[]) {
  if (names.length === 0) return

  const rows = names.map(name => ({ slug: slugify(name), name }))
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

  await client.delete(animeGenres).where(eq(animeGenres.animeId, animeId))
  for (const chunk of chunkValues(links, 30)) {
    await client.insert(animeGenres).values(chunk).onConflictDoNothing()
  }
}

async function upsertCanonicalAnime(mal: MalAnime): Promise<number> {
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
  const values: typeof anime.$inferInsert = {
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
  }

  const [row] = await db()
    .insert(anime)
    .values(values)
    .onConflictDoUpdate({ target: anime.malId, set: values })
    .returning({ id: anime.id })
  const animeId = row!.id

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

  await db().delete(characters).where(eq(characters.animeId, animeId))
  for (const chunk of chunkValues(characterRows, 50)) {
    await db().insert(characters).values(chunk).onConflictDoNothing()
  }
  await syncGenres(animeId, mal.genres)
  return animeId
}

async function linkSource(sourceRowId: number, animeId: number): Promise<void> {
  await db()
    .update(animeSources)
    .set({ animeId, metadataSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(animeSources.id, sourceRowId))
}

async function refreshCanonicalMetadata(animeId: number): Promise<boolean> {
  const [row] = await db().select({ malId: anime.malId }).from(anime).where(eq(anime.id, animeId)).limit(1)
  if (!row) return false
  const mal = await fetchMalAnime(row.malId)
  if (!mal) return false
  await upsertCanonicalAnime(mal)
  return true
}

async function resolveSourceMetadata(sourceRow: AnimeSourceRow, source: AnimeSource, detail: ScrapedAnimeDetail | null): Promise<number | null> {
  const slug = `${source.id}:${sourceRow.slug}`
  const title = (detail?.title || '').trim()
  if (!title) {
    await recordFailure(slug, 'no scraped title')
    return null
  }
  const merged = new Map<number, MalSearchEntry>()
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
  const japanese = detail?.japanese
  if (ranked.length === 0 && japanese) {
    await search(malSearchVariants(japanese))
    ranked = rankMalAnimeMatches(title, [...merged.values()].slice(0, 15))
  }
  if (ranked.length === 0) {
    const top = [...merged.values()][0]?.title ?? '-'
    await recordFailure(slug, `no MAL title matches "${title}" (top: "${top}")`)
    return null
  }

  const detailYear = parseOdYear(detail?.releaseDate ?? null)
  let yearFallback: { mal: MalAnime, diff: number } | null = null

  for (const candidate of ranked.slice(0, 3)) {
    const mal = await fetchMalAnime(candidate.id)
    if (!mal) continue

    const siteSeason = seasonNumber(title)
    const candidateSeason = seasonNumber(candidate.title)
    if (siteSeason !== null && siteSeason > 1 && candidateSeason === null && mal.year !== null) {
      if (detailYear !== null && Math.abs(detailYear - mal.year) > 1) {
        if (!yearFallback || Math.abs(detailYear - mal.year) < yearFallback.diff) {
          yearFallback = { mal, diff: Math.abs(detailYear - mal.year) }
        }
        continue
      }
    }

    const animeId = await upsertCanonicalAnime(mal)
    await linkSource(sourceRow.id, animeId)
    return animeId
  }

  if (yearFallback) {
    const animeId = await upsertCanonicalAnime(yearFallback.mal)
    await linkSource(sourceRow.id, animeId)
    return animeId
  }

  await recordFailure(slug, `no usable MAL candidate for "${title}"`)
  return null
}

export async function refreshSourceBySlug(compositeSlug: string, refreshMetadata: boolean): Promise<void> {
  const split = splitSource(compositeSlug)
  if (!split) return
  const source = split.source
  const vendorSlug = split.rest

  let sourceRow = await getSourceRow(source.id, vendorSlug)
  if (!sourceRow) {
    const [row] = await db()
      .insert(animeSources)
      .values({ source: source.id, slug: vendorSlug, url: `${source.baseUrl}/anime/${vendorSlug}/` })
      .onConflictDoNothing()
      .returning()
    sourceRow = row ?? await getSourceRow(source.id, vendorSlug)
    if (!sourceRow) return
  }

  const detail = await source.detailFresh(vendorSlug)
  let hasNewEpisodes = false
  let statusChanged = false
  if (detail) {
    const status = normalizeStatus(detail.status)
    const latestEpisodeAt = detail.episodes
      .map(entry => parseEpisodeDate(entry.date))
      .filter((date): date is Date => date !== null)
      .reduce<Date | null>((latest, date) => (!latest || date > latest ? date : latest), null)
    const maxBefore = await loadSourceMax(sourceRow.id)
    const maxInDetail = detail.episodes.reduce((max, entry) => {
      const parsed = episodeNumber(entry.slug) ?? episodeNumber(entry.title)
      return parsed != null && parsed > max ? parsed : max
    }, 0)
    hasNewEpisodes = Math.max(maxBefore, maxInDetail) > maxBefore
    statusChanged = sourceRow.status != null && sourceRow.status !== status
    await upsertEpisodes(source, sourceRow.id, detail.episodes)
    await db().update(animeSources).set({
      status,
      ...(latestEpisodeAt ? { latestEpisodeAt } : {}),
      updatedAt: new Date(),
    }).where(eq(animeSources.id, sourceRow.id))
  }

  const linkedAnimeId = sourceRow.animeId
  if (linkedAnimeId) {
    const metadataStale = !sourceRow.metadataSyncedAt || Date.now() - sourceRow.metadataSyncedAt.getTime() > METADATA_REFRESH_MS
    if (statusChanged || (metadataStale && (hasNewEpisodes || refreshMetadata))) {
      await refreshCanonicalMetadata(linkedAnimeId)
      await db().update(animeSources).set({ metadataSyncedAt: new Date() }).where(eq(animeSources.id, sourceRow.id))
    }
    if (hasNewEpisodes) {
      await db().update(anime).set({ lastNewEpisodeAt: new Date() }).where(eq(anime.id, linkedAnimeId))
    }
    await syncAnimeAggregate(linkedAnimeId)
  }
  else if (refreshMetadata) {
    const animeId = await resolveSourceMetadata(sourceRow, source, detail)
    if (animeId) await syncAnimeAggregate(animeId)
  }
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
        slug: card.slug,
        day: card.day,
        date: card.date,
        status: 'COMPLETED' as const,
      }))
      const done = await attempt(
        registerOngoingCards(source, source.id, cards),
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
    const cards: { slug: string, day: string, date: string, episode: string, status?: 'ONGOING' | 'COMPLETED', ongoingRank: number }[] = []
    const first = await attempt(
      source.ongoingFresh(1),
      error => console.warn(`[catalog] ${source.id} ongoing page 1 failed:`, error instanceof Error ? error.message : error),
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
        error => console.warn(`[catalog] ${source.id} ongoing page ${page} failed:`, error instanceof Error ? error.message : error),
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
    if (cards.length > 0) console.log(`[catalog] ${source.id}: registered ${cards.length} ongoing cards`)
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

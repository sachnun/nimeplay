import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { anime, animeGenres, appState, characters, episodes, genres, media } from '../database/schema'
import { db } from './db'
import { fetchMalAnime, malSearchVariants, rankMalAnimeMatches, searchMalAnimeEntries, seasonNumber } from './mal'
import { isValidMediaKey, mediaRef, type MediaRef } from './media'
import { fetchRemoteMedia, storeMedia } from './media-store'
import { getSources, scrapeAnimeDetailFresh, splitSource } from './sources'
import type { AnimeSource } from './sources/types'
import { parseEpisodeDate } from './sources/shared'

const METADATA_REFRESH_MS = 7 * 24 * 60 * 60 * 1000
const RETRY_MS = 24 * 60 * 60 * 1000
const SOFT_RETRY_MS = 30 * 60 * 1000
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
  const soft = message.includes('Too many subrequests') || message.startsWith('poster ')
  return db()
    .update(anime)
    .set({
      metadataAttempts: sql`${anime.metadataAttempts} + 1`,
      metadataLastError: message.slice(0, 500),
      metadataRetryAt: new Date(Date.now() + (soft ? SOFT_RETRY_MS : RETRY_MS)),
    })
    .where(eq(anime.slug, slug))
    .then(
      () => {},
      error => {
        console.warn(`[metadata] record failure failed ${slug}:`, error instanceof Error ? error.message : error)
      },
    )
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

async function ensureMedia(ref: MediaRef): Promise<string | null> {
  const [existing] = await db()
    .select({ key: media.key, status: media.status })
    .from(media)
    .where(eq(media.sourceUrl, ref.sourceUrl))
    .limit(1)
  if (existing?.status === 'ready') return existing.key
  const key = existing?.key ?? ref.key
  try {
    const { contentType, bytes } = await fetchRemoteMedia(ref.sourceUrl)
    const stored = await storeMedia(key, bytes, contentType)
    await db().insert(media).values({
      key,
      sourceUrl: ref.sourceUrl,
      status: 'ready',
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      mirroredAt: new Date(),
      attempts: 1,
    }).onConflictDoUpdate({
      target: media.sourceUrl,
      set: {
        status: 'ready',
        contentType: stored.contentType,
        byteSize: stored.byteSize,
        mirroredAt: new Date(),
        attempts: sql`${media.attempts} + 1`,
        lastError: null,
        nextRetryAt: null,
      },
    })
    return key
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db().insert(media).values({
      key,
      sourceUrl: ref.sourceUrl,
      status: 'failed',
      attempts: 1,
      lastError: message.slice(0, 300),
      nextRetryAt: new Date(Date.now() + MEDIA_RETRY_MS),
    }).onConflictDoUpdate({
      target: media.sourceUrl,
      set: {
        status: 'failed',
        attempts: sql`${media.attempts} + 1`,
        lastError: message.slice(0, 300),
        nextRetryAt: new Date(Date.now() + MEDIA_RETRY_MS),
      },
    }).catch(() => {})
    console.warn(`[media] mirror failed ${ref.sourceUrl}:`, message)
    return null
  }
}

async function mirrorRefs(refs: MediaRef[]): Promise<Map<string, string>> {
  const unique = new Map<string, MediaRef>()
  for (const ref of refs) {
    if (isValidMediaKey(ref.key) && !unique.has(ref.sourceUrl)) unique.set(ref.sourceUrl, ref)
  }
  if (unique.size === 0) return new Map()
  const entries = await Promise.all([...unique.values()].map(async ref => [ref.sourceUrl, await ensureMedia(ref)] as const))
  const keys = new Map<string, string>()
  for (const [sourceUrl, key] of entries) {
    if (key) keys.set(sourceUrl, key)
  }
  return keys
}

export async function applyMalMetadata(slug: string, mal: NonNullable<Awaited<ReturnType<typeof fetchMalAnime>>>) {
  const [target] = await db().select({ id: anime.id }).from(anime).where(eq(anime.slug, slug)).limit(1)
  if (!target) return
  const animeId = target.id

  const posterRef = mediaRef(mal.poster, 'posters')
  const refs: MediaRef[] = posterRef ? [posterRef] : []
  const characterRefs = mal.characters.map((c) => {
    const imageRef = mediaRef(c.imageUrl, 'characters')
    if (imageRef) refs.push(imageRef)
    return imageRef
  })

  const imageKeys = await mirrorRefs(refs)
  const posterKey = posterRef ? (imageKeys.get(posterRef.sourceUrl) ?? null) : null

  const characterRows = mal.characters.map((c, index) => {
    const imageRef = characterRefs[index] ?? null
    return {
      animeId,
      malId: null,
      name: c.name,
      role: c.role,
      imageKey: imageRef ? (imageKeys.get(imageRef.sourceUrl) ?? null) : null,
      voiceActorName: c.voiceActor?.name ?? null,
      voiceActorKey: null,
      sortOrder: index,
    }
  })

  await db()
    .update(anime)
    .set({
      malId: mal.malId,
      ...(mal.title ? { title: mal.title } : {}),
      synopsis: mal.synopsis,
      posterKey,
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
      metadataAttempts: 0,
      metadataLastError: null,
      metadataRetryAt: null,
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
  for (const variant of malSearchVariants(title)) {
    const batch = await searchMalAnimeEntries(variant)
    for (const entry of batch) {
      if (!merged.has(entry.id)) merged.set(entry.id, entry)
    }
    if (merged.size > 0) break
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

const CONCURRENCY = 32
const MEDIA_RETRY_MS = 6 * 60 * 60 * 1000

const FOCUS_RETRY_MS = 30 * 60 * 1000

async function pickFocusSlugs(cooled: string[], limit: number): Promise<string[]> {
  const exclude = cooled.length > 0
    ? sql` and split_part(a.slug, ':', 1) not in (${sql.join(cooled.map(id => sql`${id}`), sql`, `)})`
    : sql``
  const result = await db().execute(sql`
    select a.slug as slug
    from anime a
    where (a.mal_id is null or a.episode_count = 0)
      and (a.metadata_retry_at is null or a.metadata_retry_at < now())
      ${exclude}
    order by case when a.status = 'ONGOING' then 0 else 1 end,
             a.ongoing_rank asc nulls last,
             a.updated_at asc
    limit ${limit}
  `)
  return (result.rows as unknown as { slug: string }[]).map(row => row.slug)
}

async function deferAnime(slug: string): Promise<void> {
  const until = new Date(Date.now() + FOCUS_RETRY_MS)
  try {
    await db().execute(sql`
      update anime set metadata_retry_at = ${until}
      where slug = ${slug} and (metadata_retry_at is null or metadata_retry_at < ${until})
    `)
  }
  catch (error) {
    console.warn(`[focus] defer failed ${slug}:`, error instanceof Error ? error.message : error)
  }
}

async function focusAnime(slug: string): Promise<void> {
  let failed = false
  try {
    await refreshAnimeBySlug(slug, true)
  }
  catch (error) {
    failed = true
    console.warn(`[focus] failed ${slug}:`, error instanceof Error ? error.message : error)
  }
  const [state] = await db()
    .select({ malId: anime.malId, episodeCount: anime.episodeCount })
    .from(anime)
    .where(eq(anime.slug, slug))
    .limit(1)
  const complete = state != null && state.malId != null && state.episodeCount > 0
  if (failed || !complete) {
    const sourceId = splitSource(slug)?.source.id
    if (failed && sourceId) await setAppState(`epcooldown:${sourceId}`, new Date().toISOString()).catch(() => {})
    await deferAnime(slug)
  }
  else {
    console.log(`[focus] ready: ${slug}`)
  }
}

export async function runFocusSync(): Promise<boolean> {
  if (!acquireSync('focus')) return false
  try {
    const cooled = await activeEpisodeCooldowns()
    const slugs = await pickFocusSlugs(cooled, CONCURRENCY)
    if (slugs.length === 0) return false
    await Promise.all(slugs.map(slug => focusAnime(slug)))
    return true
  }
  catch (error) {
    console.warn('[focus] sync failed:', error instanceof Error ? error.message : error)
    return false
  }
  finally {
    releaseSync('focus')
  }
}

const EPISODE_COOLDOWN_MS = 20 * 60 * 1000

async function activeEpisodeCooldowns(): Promise<string[]> {
  const sources = getSources()
  const now = Date.now()
  const active: string[] = []
  await Promise.all(sources.map(async (source) => {
    const value = await getAppState(`epcooldown:${source.id}`)
    const at = value ? Date.parse(value) : Number.NaN
    if (Number.isFinite(at) && now - at < EPISODE_COOLDOWN_MS) active.push(source.id)
  }))
  return active
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

async function backfillCursors(): Promise<Record<string, string>> {
  const entries = await Promise.all(getSources().map(async source =>
    [source.id, await getAppState(`backfill:${source.id}`) ?? 'pending'] as const,
  ))
  return Object.fromEntries(entries)
}

async function backfillRemaining(): Promise<boolean> {
  const cursors = await backfillCursors()
  return Object.values(cursors).some(value => value !== 'done')
}

export async function runFinishedSync(): Promise<boolean> {
  if (!acquireSync('finished')) return backfillRemaining()
  let pages = 0
  try {
    let registered = 0
    for (const source of getSources()) {
      const result = await backfillCompleted(source)
      pages += result.pages
      registered += result.registered
    }
    if (registered > 0) console.log(`[finished] registered ${registered}`)
  }
  catch (error) {
    console.warn('[finished] sync failed:', error instanceof Error ? error.message : error)
  }
  finally {
    releaseSync('finished')
  }
  return pages > 0 && await backfillRemaining()
}


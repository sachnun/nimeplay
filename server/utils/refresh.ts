import type { H3Event } from 'h3'
import { eq, sql } from 'drizzle-orm'
import { anime, animeGenres, episodes, genres } from '../database/schema'
import { db } from './db'
import { bestMalAnimeMatch, fetchMalAnime, searchMalAnimeEntries } from './mal'
import { mirrorAnimeMedia } from './media-mirror'
import { toR2Url } from './r2'
import { scrapeAnimeDetailFresh, splitSource } from './sources'
import { parseEpisodeDate } from './sources/shared'

const DETAIL_REFRESH_MS = Number(process.env.REFRESH_DETAIL_MS || 6 * 60 * 60 * 1000)
const METADATA_REFRESH_MS = Number(process.env.REFRESH_METADATA_MS || 7 * 24 * 60 * 60 * 1000)

const animeRunning = new Map<number, boolean>()

function waitUntil(event: H3Event, promise: Promise<unknown>): void {
  const withWaitUntil = event as H3Event & { waitUntil?: (p: Promise<unknown>) => void }
  if (withWaitUntil.waitUntil) {
    withWaitUntil.waitUntil(promise)
    return
  }
  promise.catch(() => {})
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

async function upsertEpisodes(
  animeSlug: string,
  list: { title: string, slug: string, date: string }[],
) {
  const sourcePrefix = `${animeSlug.split(':')[0]}:`
  const rows = list
    .map(entry => ({ entry, number: episodeNumber(entry.slug) ?? episodeNumber(entry.title) }))
    .filter((row): row is { entry: typeof list[number], number: number } => row.number !== null)

  if (rows.length === 0) return

  const chunkSize = 15
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map(({ entry, number }) => ({
      animeSlug,
      slug: `${sourcePrefix}${entry.slug}`,
      number,
      title: entry.title,
      releaseDate: entry.date || null,
    }))
    await db().insert(episodes).values(chunk).onConflictDoNothing()
  }
}

async function syncGenres(animeSlug: string, names: string[]) {
  if (names.length === 0) return

  const rows = names.map(name => ({
    slug: slugify(name),
    name,
  }))

  const genreChunkSize = 30
  for (let i = 0; i < rows.length; i += genreChunkSize) {
    await db().insert(genres).values(rows.slice(i, i + genreChunkSize)).onConflictDoNothing()
  }
  const stored = await db().select({ id: genres.id, slug: genres.slug }).from(genres)
  const bySlug = new Map(stored.map(genre => [genre.slug, genre.id]))

  const links = rows
    .map(row => bySlug.get(row.slug))
    .filter((id): id is number => id !== undefined)
    .map(id => ({ animeSlug, genreId: id }))

  await db().delete(animeGenres).where(eq(animeGenres.animeSlug, animeSlug))
  const linkChunkSize = 30
  for (let i = 0; i < links.length; i += linkChunkSize) {
    await db().insert(animeGenres).values(links.slice(i, i + linkChunkSize)).onConflictDoNothing()
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
    })
    .where(eq(anime.slug, slug))
  await syncGenres(slug, mal.genres)
  await mirrorAnimeMedia(poster, characters)
}

/** Demote the current mal_id owner when this row's source is preferred over theirs. */
async function stealIfPreferred(slug: string, malId: number): Promise<boolean> {
  const [owner] = await db().select({ slug: anime.slug }).from(anime).where(eq(anime.malId, malId)).limit(1)
  if (!owner || owner.slug === slug) return false
  const mine = splitSource(slug).source.priority
  const theirs = splitSource(owner.slug).source.priority
  if (mine >= theirs) return false
  await db().update(anime).set({ malId: null, metadataSyncedAt: null }).where(eq(anime.slug, owner.slug))
  console.log(`[metadata] ${slug} takes mal_id ${malId} from ${owner.slug}`)
  return true
}

export async function resolveMetadata(slug: string, title: string): Promise<boolean> {
  try {
    const entries = await searchMalAnimeEntries(title)
    const entry = bestMalAnimeMatch(title, entries)
    if (!entry) {
      console.warn(`[metadata] no MAL title matches "${title}" (top: "${entries[0]?.title ?? '-'}")`)
      return false
    }

    const mal = await fetchMalAnime(entry.id)
    if (!mal) return false

    try {
      await applyMalMetadata(slug, mal)
      return true
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('UNIQUE constraint failed') && await stealIfPreferred(slug, mal.malId)) {
        await applyMalMetadata(slug, mal)
        return true
      }
      if (message.includes('UNIQUE constraint failed')) {
        console.warn(`[metadata] mal_id ${mal.malId} already owned by a preferred row, skipping ${slug}`)
        return false
      }
      throw error
    }
  }
  catch (error) {
    console.warn(`[metadata] failed ${slug}:`, error instanceof Error ? error.message : error)
    return false
  }
}

export async function refreshAnimeBySlug(slug: string, title: string, refreshMetadata: boolean): Promise<void> {
  try {
    const detail = await scrapeAnimeDetailFresh(slug)
    if (detail) {
      const status = normalizeStatus(detail.status)
      const latestEpisodeAt = detail.episodes
        .map(entry => parseEpisodeDate(entry.date))
        .filter((date): date is Date => date !== null)
        .reduce<Date | null>((latest, date) => (!latest || date > latest ? date : latest), null)
      await db()
        .update(anime)
        .set({
          title: detail.title || title,
          status,
          ...(status === 'COMPLETED' ? { day: null, ongoingRank: null } : {}),
          ...(latestEpisodeAt ? { latestEpisodeAt } : {}),
          updatedAt: new Date(),
        })
        .where(eq(anime.slug, slug))
      await upsertEpisodes(slug, detail.episodes)
    }
  }
  catch (error) {
    console.warn(`[refresh] detail failed ${slug}:`, error instanceof Error ? error.message : error)
  }
  if (refreshMetadata) {
    try {
      await resolveMetadata(slug, title)
    }
    catch (error) {
      console.warn(`[refresh] metadata failed ${slug}:`, error instanceof Error ? error.message : error)
    }
  }
}

/**
 * Background refresh of a single anime's episode list and (when stale) its
 * MyAnimeList metadata, triggered on-demand when the anime is opened.
 * Resolves the slug from the MAL id before scraping.
 */
export function scheduleAnimeRefresh(event: H3Event, malId: number): void {
  if (animeRunning.get(malId)) return
  animeRunning.set(malId, true)
  const task = (async () => {
    try {
      const [row] = await db()
        .select({
          slug: anime.slug,
          title: anime.title,
          status: anime.status,
          updatedAt: anime.updatedAt,
          metadataSyncedAt: anime.metadataSyncedAt,
          episodeCount: sql<number>`(select count(*) from episodes e where e.anime_slug = ${anime.slug})`,
        })
        .from(anime)
        .where(eq(anime.malId, malId))
        .limit(1)
      if (!row) return

      const now = Date.now()
      const stale = !row.updatedAt || now - row.updatedAt.getTime() > DETAIL_REFRESH_MS
      const needsMetadata = !row.metadataSyncedAt || now - row.metadataSyncedAt.getTime() > METADATA_REFRESH_MS
      const hasEpisodes = Number(row.episodeCount) > 0

      if ((row.status === 'ONGOING' && stale) || !hasEpisodes) {
        await refreshAnimeBySlug(row.slug, row.title, needsMetadata)
      }
    }
    finally {
      animeRunning.delete(malId)
    }
  })().catch(error => console.warn(`[refresh] anime ${malId} failed:`, error instanceof Error ? error.message : error))
  waitUntil(event, task)
}
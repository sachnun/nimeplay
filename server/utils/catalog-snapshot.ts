import { eq } from 'drizzle-orm'
import { anime, animeGenres, episodes, genres } from '../database/schema'
import { db } from './db'
import { r2Bucket } from './r2'

const SNAPSHOT_KEY = 'snapshot/catalog.json'

export interface SnapshotAnime {
  slug: string
  malId: number | null
  title: string
  poster: string | null
  synopsis: string | null
  rating: number | null
  status: string | null
  type: string | null
  day: string | null
  season: string | null
  studio: string | null
  source: string | null
  latestEpisodeAt: number | null
  ongoingRank: number | null
}

export interface SnapshotGenre {
  slug: string
  name: string
}

export interface SnapshotEpisode {
  animeSlug: string
  number: number
  slug: string
  title: string
  date: string
}

export interface CatalogSnapshot {
  savedAt: number
  anime: SnapshotAnime[]
  genres: SnapshotGenre[]
  animeGenreSlugs: { animeSlug: string, genreSlug: string }[]
  episodes: SnapshotEpisode[]
}

let parsed: CatalogSnapshot | null = null
let snapshotSaveRunning = false
let lastSnapshotSave = 0

const SNAPSHOT_SAVE_MS = Number(process.env.SNAPSHOT_SAVE_MS || 15 * 60 * 1000)

async function readSnapshot(): Promise<CatalogSnapshot | null> {
  const bucket = r2Bucket()
  if (!bucket) return null
  const object = await bucket.get(SNAPSHOT_KEY)
  if (!object?.body) return null
  const text = await new Response(object.body).text()
  try {
    return JSON.parse(text) as CatalogSnapshot
  } catch {
    return null
  }
}

/**
 * D1 outage fallback catalog, cached in memory per isolate after the first
 * read. Null when no snapshot has been saved yet (or the binding is missing).
 */
export async function snapshotCatalog(): Promise<CatalogSnapshot | null> {
  if (parsed) return parsed
  parsed = await readSnapshot()
  return parsed
}

async function buildSnapshot(): Promise<CatalogSnapshot> {
  const [animeRows, genreRows, linkRows, episodeRows] = await Promise.all([
    db()
      .select({
        slug: anime.slug,
        malId: anime.malId,
        title: anime.title,
        poster: anime.poster,
        synopsis: anime.synopsis,
        rating: anime.rating,
        status: anime.status,
        type: anime.type,
        day: anime.day,
        season: anime.season,
        studio: anime.studio,
        source: anime.source,
        latestEpisodeAt: anime.latestEpisodeAt,
        ongoingRank: anime.ongoingRank,
      })
      .from(anime),
    db().select({ slug: genres.slug, name: genres.name }).from(genres),
    db()
      .select({
        animeSlug: animeGenres.animeSlug,
        genreSlug: genres.slug,
      })
      .from(animeGenres)
      .innerJoin(genres, eq(genres.id, animeGenres.genreId)),
    db()
      .select({
        animeSlug: episodes.animeSlug,
        number: episodes.number,
        slug: episodes.slug,
        title: episodes.title,
        date: episodes.releaseDate,
      })
      .from(episodes),
  ])

  return {
    savedAt: Date.now(),
    anime: animeRows.map(row => ({ ...row, latestEpisodeAt: row.latestEpisodeAt?.getTime() ?? null })),
    genres: genreRows,
    animeGenreSlugs: linkRows,
    episodes: episodeRows.map(row => ({ ...row, date: row.date ?? '' })),
  }
}

/**
 * Persist the catalog to R2 so read routes can keep serving during a D1
 * outage. Throttled and one-flight; call after catalog writes succeed.
 */
export async function saveCatalogSnapshot(): Promise<void> {
  const now = Date.now()
  if (snapshotSaveRunning || now - lastSnapshotSave < SNAPSHOT_SAVE_MS) return
  snapshotSaveRunning = true
  lastSnapshotSave = now
  try {
    const snapshot = await buildSnapshot()
    const bucket = r2Bucket()
    if (!bucket) return
    await bucket.put(SNAPSHOT_KEY, new TextEncoder().encode(JSON.stringify(snapshot)).buffer, {
      httpMetadata: { contentType: 'application/json' },
    })
    parsed = snapshot
    console.log(`[snapshot] saved ${snapshot.anime.length} anime, ${snapshot.episodes.length} episodes`)
  }
  catch (error) {
    lastSnapshotSave = 0
    console.warn('[snapshot] save failed:', error instanceof Error ? error.message : error)
  }
  finally {
    snapshotSaveRunning = false
  }
}
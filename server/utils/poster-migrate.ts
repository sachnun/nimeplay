import { eq, sql } from 'drizzle-orm'
import { anime } from '../database/schema'
import { db } from './db'
import { fetchPosterBytes, hasCachedPoster, posterKey, posterSrc, postersEnabled, storePoster } from './posters'

const CONCURRENCY = Number(process.env.POSTER_MIGRATE_CONCURRENCY || 2)
const ITEM_DELAY_MS = Number(process.env.POSTER_MIGRATE_ITEM_DELAY_MS || 900)
const WALL_BUDGET_MS = Number(process.env.POSTER_MIGRATE_WALL_MS || 120000)
const BUDGET = Number(process.env.POSTER_MIGRATE_BUDGET || 600)

const ABSOLUTE_POSTER = sql`${anime.poster} like 'http%'`

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export interface PosterMigrationStats {
  pending: number
  mirrored: number
  failed: number
  remaining: number
  skipped?: boolean
}

async function countPendingPosters(): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(anime)
    .where(ABSOLUTE_POSTER)
  return row?.count ?? 0
}

/**
 * Mirror one batch of poster URLs already stored in D1 into R2, then point the
 * row at the local cache path. Paced and retried to stay under MAL CDN's burst
 * limit for worker egress IPs. Resumable: rows are updated as they finish, so
 * re-running only picks up what is still remote.
 */
export async function runPosterMigration(): Promise<PosterMigrationStats> {
  const pending = await countPendingPosters()
  console.log(`[posters] ${pending} anime still reference remote posters`)
  if (!postersEnabled()) {
    console.log('[posters] skipped: POSTERS binding unavailable')
    return { pending, mirrored: 0, failed: 0, remaining: pending, skipped: true }
  }

  const targets = await db()
    .select({ slug: anime.slug, poster: anime.poster })
    .from(anime)
    .where(ABSOLUTE_POSTER)
    .orderBy(sql`random()`)
    .limit(BUDGET)

  console.log(`[posters] mirroring ${targets.length}/${pending} posters into R2`)
  let mirrored = 0
  let failed = 0
  let next = 0
  const deadline = Date.now() + WALL_BUDGET_MS
  const runners = Array.from({ length: Math.max(1, Math.min(CONCURRENCY, targets.length)) }, async () => {
    while (Date.now() < deadline) {
      const index = next++
      if (index >= targets.length) return
      const { slug, poster } = targets[index]!
      try {
        const posterUrl = poster!
        const key = posterKey(posterUrl)
        if (!key) {
          console.warn(`[posters] skipping non-mirrorable poster for ${slug}`)
        }
        else {
          if (!(await hasCachedPoster(key))) {
            const { contentType, bytes } = await fetchPosterBytes(posterUrl)
            await storePoster(key, bytes, contentType)
          }
          await db()
            .update(anime)
            .set({ poster: posterSrc(posterUrl) })
            .where(eq(anime.slug, slug))
          mirrored++
        }
      }
      catch (error) {
        failed++
        console.warn(`[posters] failed ${slug}:`, error instanceof Error ? error.message : error)
      }
      await sleep(ITEM_DELAY_MS + Math.random() * ITEM_DELAY_MS)
    }
  })
  await Promise.all(runners)

  const totalRemaining = await countPendingPosters()
  console.log(`[posters] mirrored ${mirrored}/${targets.length}, failed ${failed}, remaining ${totalRemaining}`)
  return { pending, mirrored, failed, remaining: totalRemaining }
}

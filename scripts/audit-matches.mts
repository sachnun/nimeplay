/**
 * One-off audit: re-validate every synced anime against the strict
 * season-aware title matcher; reset rows bound to the wrong MAL entry.
 */
import { eq } from 'drizzle-orm'
import { neonConfig, neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from '../server/database/schema.ts'
import { fetchMalAnime, titlesMatch } from '../server/utils/mal.ts'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')
if (/@(localhost|127\.0\.0\.1)/.test(url)) neonConfig.fetchEndpoint = process.env.NEON_PROXY_URL ?? 'http://localhost:4444/sql'
const db = drizzle(neon(url), { schema })

const rows = await db
  .select({ slug: schema.anime.slug, malId: schema.anime.malId, title: schema.anime.title })
  .from(schema.anime)
  .orderBy(schema.anime.malId)

const cache = new Map<number, Awaited<ReturnType<typeof fetchMalAnime>>>()
const bad: { slug: string, malId: number }[] = []
let last = -1

for (const row of rows) {
  if (row.malId === null) continue
  if (row.malId !== last) {
    await new Promise(resolve => setTimeout(resolve, 400))
    cache.set(row.malId, await fetchMalAnime(row.malId))
    last = row.malId
  }
  const mal = cache.get(row.malId)
  if (!mal) continue
  if (!titlesMatch(row.title, mal.title)) {
    console.log(`MISMATCH: "${row.title}" (${row.slug}) -> mal ${row.malId} "${mal.title}"`)
    bad.push({ slug: row.slug, malId: row.malId })
  }
}

for (const item of bad) {
  await db.update(schema.anime).set({
    malId: null,
    metadataSyncedAt: null,
    synopsis: null,
    poster: null,
    rating: null,
    rank: null,
    popularity: null,
    season: null,
    trailerId: null,
    characters: [],
  }).where(eq(schema.anime.slug, item.slug))
}
console.log(`audited ${rows.length} rows, reset ${bad.length}`)

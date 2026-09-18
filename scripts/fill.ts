process.loadEnvFile('.env.local')

import { setTimeout as sleep } from 'node:timers/promises'
import { eq, sql } from 'drizzle-orm'
import { db } from '../server/utils/db'
import { runCatalogSync, resolveAnimeMetadata, refreshAnimeBySlug } from '../server/utils/refresh'
import { fetchRemoteMedia, storeMedia } from '../server/utils/media'
import { media } from '../server/database/schema'

const phase = process.argv[2] ?? 'all'
const maxRuns = Number(process.argv[3] ?? 100000)
const metaConcurrency = Number(process.argv[4] ?? 24)
const epConcurrency = Number(process.argv[5] ?? 12)
const mediaConcurrency = 16

const ATTEMPTABLE = `mal_id is null
  and (metadata_retry_at is null or metadata_retry_at <= now())
  and not exists (
    select 1 from anime r
    where r.mal_id is not null
      and regexp_replace(lower(r.title), '[^a-z0-9]', '', 'g') = regexp_replace(lower(anime.title), '[^a-z0-9]', '', 'g')
  )`

async function rows(query: string): Promise<Record<string, unknown>[]> {
  let last: unknown
  for (let i = 0; i < 20; i++) {
    try {
      const result = await db().execute(sql.raw(query))
      return result.rows as Record<string, unknown>[]
    }
    catch (error) {
      last = error
      await sleep(2000)
    }
  }
  throw last instanceof Error ? last : new Error('query failed')
}

async function count(query: string): Promise<number> {
  return Number((await rows(query))[0]?.n ?? 0)
}

async function backfillPending(): Promise<number> {
  return count("select count(*)::int n from app_state where key like 'backfill:%' and value <> 'done'")
}

async function catalog(limit: number): Promise<void> {
  let stale = 0
  let last = Infinity
  for (let i = 0; i < limit; i++) {
    const before = await count('select count(*)::int n from anime')
    await runCatalogSync({ backfill: true })
    const after = await count('select count(*)::int n from anime')
    const pending = await backfillPending()
    console.log(`[fill] catalog #${i + 1} anime=${after} (+${after - before}) backfillPending=${pending}`)
    const progress = after + (4 - pending) * 1e6
    stale = progress > last ? 0 : stale + 1
    last = progress
    if (pending === 0 && after === before && stale >= 3) break
    await sleep(300)
  }
}

async function metadata(limit: number, producer?: { done: boolean }): Promise<void> {
  let stale = 0
  let last = Infinity
  for (let round = 0; round < limit; round++) {
    const list = await rows(`
      select distinct on (regexp_replace(lower(title), '[^a-z0-9]', '', 'g')) slug, title
      from anime
      where ${ATTEMPTABLE}
      order by regexp_replace(lower(title), '[^a-z0-9]', '', 'g'),
        case when status = 'ONGOING' then 0 else 1 end,
        ongoing_rank asc nulls last
      limit 3000
    `) as { slug: string, title: string }[]
    if (list.length === 0) {
      if (producer && !producer.done) {
        await sleep(5000)
        continue
      }
      console.log('[fill] metadata: nothing left')
      break
    }
    let ok = 0
    for (let i = 0; i < list.length; i += metaConcurrency) {
      const batch = list.slice(i, i + metaConcurrency)
      const res = await Promise.all(batch.map(row => resolveAnimeMetadata(row.slug, row.title).catch(() => false)))
      ok += res.filter(Boolean).length
    }
    const remaining = await count(`select count(*)::int n from anime where ${ATTEMPTABLE}`)
    console.log(`[fill] metadata round=${round + 1} attempted=${list.length} resolved=${ok} attemptable=${remaining}`)
    stale = remaining >= last ? stale + 1 : 0
    last = remaining
    if (stale >= 40) {
      console.log('[fill] metadata stalled')
      break
    }
  }
}

async function episodes(limit: number, producer?: { done: boolean }): Promise<void> {
  let stale = 0
  let last = Infinity
  for (let round = 0; round < limit; round++) {
    const list = await rows(`
      select a.slug, a.title from anime a
      where a.mal_id is not null
        and not exists (select 1 from episodes e where e.anime_id = a.id)
      order by a.updated_at asc
      limit 4000
    `) as { slug: string, title: string }[]
    if (list.length === 0) {
      if (producer && !producer.done) {
        await sleep(5000)
        continue
      }
      console.log('[fill] episodes: nothing left')
      break
    }
    let done = 0
    for (let i = 0; i < list.length; i += epConcurrency) {
      const batch = list.slice(i, i + epConcurrency)
      const res = await Promise.all(batch.map(async (row) => {
        try {
          await refreshAnimeBySlug(row.slug, row.title, false)
          return true
        }
        catch {
          return false
        }
      }))
      done += res.filter(Boolean).length
    }
    const remaining = await count('select count(*)::int n from anime a where a.mal_id is not null and not exists (select 1 from episodes e where e.anime_id = a.id)')
    console.log(`[fill] episodes round=${round + 1} attempted=${list.length} done=${done} remaining=${remaining}`)
    stale = remaining >= last ? stale + 1 : 0
    last = remaining
    if (stale >= 20) break
  }
}

async function processMediaBatch(): Promise<{ done: number, left: number }> {
  const list = await rows(`
    select key, source_url as "sourceUrl" from media
    where status <> 'ready'
    order by created_at
    limit 3000
  `) as { key: string, sourceUrl: string }[]
  let done = 0
  for (let i = 0; i < list.length; i += mediaConcurrency) {
    const batch = list.slice(i, i + mediaConcurrency)
    await Promise.all(batch.map(async (row) => {
      try {
        const { contentType, bytes } = await fetchRemoteMedia(row.sourceUrl)
        const stored = await storeMedia(row.key, bytes, contentType)
        await db().update(media).set({
          status: 'ready',
          contentType: stored.contentType,
          byteSize: stored.byteSize,
          mirroredAt: new Date(),
          attempts: sql`${media.attempts} + 1`,
          lastError: null,
          nextRetryAt: null,
        }).where(eq(media.key, row.key))
        done++
      }
      catch (error) {
        await db().update(media).set({
          status: 'failed',
          attempts: sql`${media.attempts} + 1`,
          lastError: (error instanceof Error ? error.message : String(error)).slice(0, 300),
          nextRetryAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
        }).where(eq(media.key, row.key)).catch(() => {})
      }
    }))
  }
  const left = await count("select count(*)::int n from media where status <> 'ready'")
  return { done, left }
}

async function mediaLoop(producer: { done: boolean }): Promise<void> {
  for (let i = 0; i < 100000; i++) {
    const { done, left } = await processMediaBatch()
    if (done > 0 || i % 10 === 0) console.log(`[fill] media uploaded=${done} left=${left}`)
    if (left === 0 && producer.done) break
    if (left === 0) await sleep(3000)
  }
}

console.log(`[fill] phase=${phase} metaConcurrency=${metaConcurrency} epConcurrency=${epConcurrency}`)
if (phase === 'catalog') await catalog(maxRuns)
else if (phase === 'metadata') await metadata(maxRuns)
else if (phase === 'episodes') await episodes(maxRuns)
else if (phase === 'media') await mediaLoop({ done: true })
else {
  const producer = { done: false }
  const work = Promise.all([catalog(maxRuns), metadata(maxRuns, producer), episodes(maxRuns, producer)]).finally(() => { producer.done = true })
  await mediaLoop(producer)
  await work
}
console.log('[fill] done')
process.exit(0)

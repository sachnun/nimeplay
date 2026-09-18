process.loadEnvFile('.env.local')

import { setTimeout as sleep } from 'node:timers/promises'
import { eq, sql } from 'drizzle-orm'
import { db } from '../server/utils/db'
import { runCatalogSync, resolveAnimeMetadata } from '../server/utils/refresh'
import { fetchRemoteMedia, storeMedia } from '../server/utils/media'
import { media } from '../server/database/schema'

const phase = process.argv[2] ?? 'all'
const maxRuns = Number(process.argv[3] ?? 500)
const concurrency = Number(process.argv[4] ?? 8)

async function count(query: string): Promise<number> {
  const result = await db().execute(sql.raw(query))
  return Number((result.rows[0] as { n: number }).n)
}

async function backfillPending(): Promise<number> {
  return count("select count(*) n from app_state where key like 'backfill:%' and value <> 'done'")
}

async function catalog(limit: number): Promise<void> {
  for (let i = 0; i < limit; i++) {
    const before = await count('select count(*) n from anime')
    await runCatalogSync({ backfill: true })
    const after = await count('select count(*) n from anime')
    const pending = await backfillPending()
    console.log(`[fill] catalog #${i + 1} anime=${after} (+${after - before}) backfillPending=${pending}`)
    if (pending === 0 && after === before) break
    await sleep(500)
  }
}

const ATTEMPTABLE = `mal_id is null
  and (metadata_retry_at is null or metadata_retry_at <= now())
  and not exists (
    select 1 from anime r
    where r.mal_id is not null
      and regexp_replace(lower(r.title), '[^a-z0-9]', '', 'g') = regexp_replace(lower(anime.title), '[^a-z0-9]', '', 'g')
  )`

async function metadata(limit: number): Promise<void> {
  let stale = 0
  let last = Infinity
  for (let round = 0; round < limit; round++) {
    const result = await db().execute(sql.raw(`
      select distinct on (regexp_replace(lower(title), '[^a-z0-9]', '', 'g')) slug, title
      from anime
      where ${ATTEMPTABLE}
      order by regexp_replace(lower(title), '[^a-z0-9]', '', 'g'),
        case when status = 'ONGOING' then 0 else 1 end,
        ongoing_rank asc nulls last
      limit 2000
    `))
    const rows = result.rows as { slug: string, title: string }[]
    if (rows.length === 0) {
      console.log('[fill] metadata: nothing left to attempt')
      break
    }
    let ok = 0
    for (let i = 0; i < rows.length; i += concurrency) {
      const res = await Promise.all(rows.slice(i, i + concurrency).map(row => resolveAnimeMetadata(row.slug, row.title).catch(() => false)))
      ok += res.filter(Boolean).length
    }
    const remaining = (await db().execute(sql.raw(`select count(*)::int n from anime where ${ATTEMPTABLE}`))).rows[0] as { n: number }
    console.log(`[fill] metadata round=${round + 1} attempted=${rows.length} resolved=${ok} attemptable=${remaining.n}`)
    stale = remaining.n >= last ? stale + 1 : 0
    last = remaining.n
    if (stale >= 40) {
      console.log('[fill] metadata stalled')
      break
    }
  }
}

async function processMediaBatch(): Promise<{ done: number, left: number }> {
  const result = await db().execute(sql`
    select key, source_url as "sourceUrl" from media
    where status <> 'ready'
    order by created_at
    limit 2000
  `)
  const rows = result.rows as { key: string, sourceUrl: string }[]
  let done = 0
  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency)
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
        }).where(eq(media.key, row.key))
      }
    }))
  }
  const left = await count("select count(*) n from media where status <> 'ready'")
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

console.log(`[fill] phase=${phase} maxRuns=${maxRuns} concurrency=${concurrency}`)
if (phase === 'catalog') await catalog(maxRuns)
else if (phase === 'metadata') await metadata(maxRuns)
else if (phase === 'media') await mediaLoop({ done: true })
else {
  const producer = { done: false }
  const work = Promise.all([catalog(maxRuns), metadata(maxRuns)]).finally(() => { producer.done = true })
  await mediaLoop(producer)
  await work
}
console.log('[fill] done')
process.exit(0)

import { sql } from 'drizzle-orm'
import type { JobRow } from '../database/schema'
import { db } from './db'
import { claim, complete, enqueue, fail, prune, releaseStale } from './queue'
import { getSources } from './sources'
import { refreshAnimeBySlug, runBackfill, runOngoingSync } from './refresh'

const WALL_MS = 13 * 60 * 1000
const BATCH = 16
const STALE_MS = 10 * 60 * 1000
const DONE_TTL_MS = 24 * 60 * 60 * 1000
const worker = `task:${process.pid}`

async function handle(job: JobRow): Promise<void> {
  if (job.type === 'anime.refresh') {
    await refreshAnimeBySlug(String(job.payload.slug ?? ''), true)
    return
  }
  if (job.type === 'catalog.ongoing') {
    await runOngoingSync()
    return
  }
  if (job.type === 'catalog.backfill') {
    await runBackfill(String(job.payload.sourceId ?? ''))
    return
  }
  throw new Error(`unknown job type: ${job.type}`)
}

async function seedRefreshJobs(): Promise<void> {
  await db().execute(sql`
    insert into jobs (type, payload, dedupe_key, priority, max_attempts)
    select 'anime.refresh', jsonb_build_object('slug', a.slug), 'anime.refresh:' || a.slug, 0, 5
    from anime a
    where a.mal_id is null or a.episode_count = 0
    order by case when a.status = 'ONGOING' then 0 else 1 end,
             a.ongoing_rank asc nulls last,
             a.updated_at asc
    on conflict do nothing
  `)
}

async function drain(deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    const claimed = await claim(worker, BATCH)
    if (claimed.length === 0) return
    await Promise.all(claimed.map(async (job) => {
      try {
        await handle(job)
        await complete(job.id)
      }
      catch (error) {
        await fail(job.id, error instanceof Error ? error.message : String(error))
      }
    }))
  }
}

export async function runTick(): Promise<void> {
  const deadline = Date.now() + WALL_MS
  await releaseStale(STALE_MS)
  await prune(new Date(Date.now() - DONE_TTL_MS))
  await seedRefreshJobs()
  await drain(deadline)
}

export async function runCatalog(): Promise<void> {
  const deadline = Date.now() + WALL_MS
  await releaseStale(STALE_MS)
  await enqueue({ type: 'catalog.ongoing', dedupeKey: 'catalog.ongoing' })
  for (const source of getSources()) {
    await enqueue({ type: 'catalog.backfill', payload: { sourceId: source.id }, dedupeKey: `catalog.backfill:${source.id}` })
  }
  await seedRefreshJobs()
  await drain(deadline)
}

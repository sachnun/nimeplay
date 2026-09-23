import { sql } from 'drizzle-orm'
import type { JobRow } from '../../database/schema'
import { db } from '../db'
import { alert } from './alert'
import { claim, classifyError, complete, enqueue, fail, prune, releaseStale } from './queue'
import { getSources } from '../sources'
import { blockedSourceIds, cacheEpisodeData } from '../db/episode-cache'
import { refreshSourceBySlug, runBackfill, runOngoingSync } from './refresh'
import { blockedSources, recordFailure, recordSuccess, runGuarded, sourceOf } from '../sources/guard'

const WALL_MS = 30 * 60 * 1000
const BATCH = 64
const WAITING_ALERT = 5000
const DEAD_ALERT = 1000
const STALE_MS = 15 * 60 * 1000
const DONE_TTL_MS = 24 * 60 * 60 * 1000
const DEAD_TTL_MS = 14 * 24 * 60 * 60 * 1000
const MIRROR_SEED_LIMIT = 2000
const TASK_TYPES = ['anime.refresh', 'catalog.ongoing', 'catalog.backfill', 'episode.cache']
const worker = `task:${process.pid}`

async function handle(job: JobRow): Promise<void> {
  if (job.type === 'anime.refresh') {
    await refreshSourceBySlug(String(job.payload.slug ?? ''), true)
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
  if (job.type === 'episode.cache') {
    await cacheEpisodeData(String(job.payload.slug ?? ''))
    return
  }
  throw new Error(`unknown job type: ${job.type}`)
}

async function seedRefreshJobs(): Promise<void> {
  await db().execute(sql`
    insert into jobs (type, payload, dedupe_key, priority, max_attempts)
    select 'anime.refresh', jsonb_build_object('slug', s.source || ':' || s.slug), 'anime.refresh:' || s.source || ':' || s.slug,
           case when s.status = 'ONGOING' then 5 else 0 end, 5
    from anime_sources s
    where (
      s.anime_id is null
      or not exists (select 1 from episodes e where e.source_id = s.id)
      or (s.status = 'ONGOING' and s.updated_at < now() - interval '2 hours')
    )
    and not exists (
      select 1 from jobs j
      where j.dedupe_key = 'anime.refresh:' || s.source || ':' || s.slug
        and j.status = 'dead' and j.run_at > now()
    )
    order by case when s.status = 'ONGOING' then 0 else 1 end,
             s.ongoing_rank asc nulls last,
             s.updated_at asc
    on conflict do nothing
  `)
}

async function seedEpisodeCacheJobs(): Promise<void> {
  for (const sourceId of blockedSourceIds()) {
    await db().execute(sql`
      insert into jobs (type, payload, dedupe_key, priority, max_attempts)
      select 'episode.cache', jsonb_build_object('slug', e.slug), 'episode.cache:' || e.slug, 1, 5
      from episodes e
      join anime_sources s on s.id = e.source_id
      where (e.cache is null or e.cached_at < now() - interval '3 days')
        and s.source = ${sourceId}
        and not exists (
          select 1 from jobs j
          where j.dedupe_key = 'episode.cache:' || e.slug
            and (j.status in ('waiting', 'active') or (j.status = 'dead' and j.run_at > now()))
        )
      order by e.id
      limit ${MIRROR_SEED_LIMIT}
      on conflict do nothing
    `)
  }
  await db().execute(sql`
    insert into jobs (type, payload, dedupe_key, priority, max_attempts)
    select 'episode.cache', jsonb_build_object('slug', e.slug), 'episode.cache:' || e.slug, -1, 5
    from episodes e
    join anime_sources s on s.id = e.source_id
    join anime a on a.id = s.anime_id
    where a.status = 'ONGOING'
      and (e.cache is null or e.cached_at < now() - interval '3 days')
      and not exists (
        select 1 from jobs j
        where j.dedupe_key = 'episode.cache:' || e.slug
          and (j.status in ('waiting', 'active') or (j.status = 'dead' and j.run_at > now()))
      )
    order by e.id
    limit ${MIRROR_SEED_LIMIT}
    on conflict do nothing
  `)
}

async function processJob(job: JobRow): Promise<void> {
  const sourceId = sourceOf(job)
  await runGuarded(sourceId, async () => {
    try {
      await handle(job)
      await complete(job.id)
      recordSuccess(sourceId)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (classifyError(message) === 'transient') {
        if (recordFailure(sourceId)) await alert(`breaker:${sourceId}`, `circuit breaker opened for ${sourceId}`)
      }
      else {
        recordSuccess(sourceId)
      }
      await fail(job.id, message)
    }
  })
}

async function logStats(): Promise<void> {
  const counts = await db().execute(sql`
    select status, count(*)::int as n from jobs where status in ('waiting', 'active', 'dead') group by status
  `) as unknown as { rows: { status: string, n: number }[] }
  const waiting = await db().execute(sql`
    select coalesce(payload->>'sourceId', split_part(payload->>'slug', ':', 1), 'none') as vendor, count(*)::int as n
    from jobs where status = 'waiting' group by 1 order by n desc limit 5
  `) as unknown as { rows: { vendor: string, n: number }[] }
  const dead = await db().execute(sql`
    select count(*)::int as n from jobs where status = 'dead' and updated_at > now() - interval '1 hour'
  `) as unknown as { rows: { n: number }[] }
  const waitingTotal = counts.rows.find(row => row.status === 'waiting')?.n ?? 0
  const deadHour = dead.rows[0]?.n ?? 0
  console.log('[tick]', JSON.stringify({ counts: counts.rows, waiting: waiting.rows, deadHour }))
  if (waitingTotal > WAITING_ALERT) await alert('queue:backlog', `job queue backlog: ${waitingTotal} waiting`, { waiting: waiting.rows })
  if (deadHour > DEAD_ALERT) await alert('queue:dead', `${deadHour} jobs died in the last hour`, { counts: counts.rows })
}

async function drain(deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    const claimed = await claim(worker, BATCH, TASK_TYPES, blockedSources())
    if (claimed.length === 0) return
    await Promise.all(claimed.map(processJob))
  }
}

export async function runTick(): Promise<void> {
  const deadline = Date.now() + WALL_MS
  await releaseStale(STALE_MS)
  await prune(new Date(Date.now() - DONE_TTL_MS), new Date(Date.now() - DEAD_TTL_MS))
  await seedRefreshJobs()
  await seedEpisodeCacheJobs()
  await drain(deadline)
  await logStats()
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

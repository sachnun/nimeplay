import { sql } from 'drizzle-orm'
import type { JobRow } from '../../database/schema'
import { db } from '../db'
import { ok, warn } from '../log'
import { getSources } from '../sources'
import { blockedSources, recordFailure, recordSuccess, sourceOf } from '../sources/guard'
import { alert } from './alert'
import { claim, classifyError, complete, fail, prune, releaseStale } from './queue'
import { refreshSourceBySlug, runBackfill, runOngoingSync } from './refresh'

const BATCH = 64
const STALE_MS = 15 * 60 * 1000
const DONE_TTL_MS = 24 * 60 * 60 * 1000
const DEAD_TTL_MS = 14 * 24 * 60 * 60 * 1000
const TASK_TYPES = ['anime.refresh', 'catalog.ongoing', 'catalog.backfill']
const worker = `task:${process.pid}`

async function handle(job: JobRow): Promise<void> {
  if (job.type === 'anime.refresh') {
    await refreshSourceBySlug(String(job.payload.slug ?? ''))
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

async function seedRefreshJobs(createdSince: Date): Promise<void> {
  await db().execute(sql`
    insert into jobs (type, payload, dedupe_key, priority, max_attempts)
    select 'anime.refresh', jsonb_build_object('slug', s.source || ':' || s.slug), 'anime.refresh:' || s.source || ':' || s.slug,
           case when s.status = 'ONGOING' then 5 else 0 end, 5
    from anime_sources s
    where (s.status = 'ONGOING' and s.created_at >= ${createdSince}
      or s.updated_at < now() - (
        case
          when s.status = 'ONGOING' then interval '6 hours'
          when s.anime_id is not null and exists (select 1 from episodes e where e.source_id = s.id) then interval '30 days'
          else interval '1 day'
        end
      ))
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

async function processJob(job: JobRow): Promise<void> {
  const sourceId = sourceOf(job)
  const label = String(job.payload.slug ?? job.payload.sourceId ?? job.type)
  const startedAt = Date.now()
  try {
    await handle(job)
    await complete(job.id)
    recordSuccess(sourceId)
    ok(`[job] ok ${label}`, { type: job.type, ms: Date.now() - startedAt })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warn(`[job] fail ${label}`, { type: job.type, ms: Date.now() - startedAt, error: message })
    if (classifyError(message) === 'transient') {
      if (recordFailure(sourceId)) await alert(`breaker:${sourceId}`, `circuit breaker opened for ${sourceId}`)
    } else {
      recordSuccess(sourceId)
    }
    await fail(job.id, message)
  }
}

async function drain(types: string[] = TASK_TYPES): Promise<void> {
  while (true) {
    const claimed = await claim(worker, BATCH, types, blockedSources())
    if (claimed.length === 0) return
    await Promise.all(claimed.map(processJob))
  }
}

export async function runCatalog(): Promise<void> {
  const startedAt = new Date()
  await releaseStale(STALE_MS)
  await prune(new Date(Date.now() - DONE_TTL_MS), new Date(Date.now() - DEAD_TTL_MS))
  await runOngoingSync()
  await Promise.all(getSources().map(source => runBackfill(source.id)))
  await seedRefreshJobs(startedAt)
  await drain()
}

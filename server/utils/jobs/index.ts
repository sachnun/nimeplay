import { Data, Effect } from 'effect'
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

class JobFailure extends Data.TaggedError('JobFailure')<{ readonly message: string }> {}

function toJobFailure(error: unknown): JobFailure {
  return new JobFailure({ message: error instanceof Error ? error.message : String(error) })
}

function handle(job: JobRow): Effect.Effect<void, JobFailure> {
  if (job.type === 'anime.refresh') {
    return Effect.tryPromise({ try: () => refreshSourceBySlug(String(job.payload.slug ?? '')), catch: toJobFailure })
  }
  if (job.type === 'catalog.ongoing') {
    return Effect.tryPromise({ try: () => runOngoingSync(), catch: toJobFailure })
  }
  if (job.type === 'catalog.backfill') {
    return Effect.tryPromise({ try: () => runBackfill(String(job.payload.sourceId ?? '')), catch: toJobFailure })
  }
  return Effect.fail(new JobFailure({ message: `unknown job type: ${job.type}` }))
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

function processJob(job: JobRow): Effect.Effect<void> {
  const sourceId = sourceOf(job)
  const label = String(job.payload.slug ?? job.payload.sourceId ?? job.type)
  const startedAt = Date.now()
  const run = Effect.gen(function* () {
    yield* handle(job)
    yield* Effect.tryPromise({ try: () => complete(job.id), catch: toJobFailure })
    recordSuccess(sourceId)
    ok(`[job] ok ${label}`, { type: job.type, ms: Date.now() - startedAt })
  })
  return run.pipe(
    Effect.catch(error =>
      Effect.promise(async () => {
        warn(`[job] fail ${label}`, { type: job.type, ms: Date.now() - startedAt, error: error.message })
        if (classifyError(error.message) === 'transient') {
          if (recordFailure(sourceId)) await alert(`breaker:${sourceId}`, `circuit breaker opened for ${sourceId}`)
        } else {
          recordSuccess(sourceId)
        }
        await fail(job.id, error.message)
      }),
    ),
  )
}

async function drain(types: string[] = TASK_TYPES): Promise<void> {
  while (true) {
    const claimed = await claim(worker, BATCH, types, blockedSources())
    if (claimed.length === 0) return
    await Effect.runPromise(Effect.forEach(claimed, processJob, { concurrency: 'unbounded', discard: true }))
  }
}

export async function runCatalog(): Promise<void> {
  const startedAt = new Date()
  await releaseStale(STALE_MS)
  await prune(new Date(Date.now() - DONE_TTL_MS), new Date(Date.now() - DEAD_TTL_MS))
  await runOngoingSync()
  await Effect.runPromise(
    Effect.forEach(getSources(), source => Effect.promise(() => runBackfill(source.id)), {
      concurrency: 'unbounded',
      discard: true,
    }),
  )
  await seedRefreshJobs(startedAt)
  await drain()
}

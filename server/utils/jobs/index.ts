import { Clock, Effect, Schema } from 'effect'
import { sql } from 'drizzle-orm'
import type { JobRow } from '../../database/schema'
import { db } from '../db'
import { ok, warn } from '../log'
import type { AniList } from '../mal/anilist'
import type { Http } from '../net/http'
import { getSources } from '../sources'
import { blockedSources, recordFailure, recordSuccess, sourceOf } from '../sources/guard'
import { alert } from './alert'
import { claim, classifyError, complete, fail, prune, releaseStale } from './queue'
import { refreshSourceBySlug, runBackfill, runOngoingSync } from './refresh'

const BATCH = 64
const JOB_CONCURRENCY = Math.max(1, Number(process.env.JOB_CONCURRENCY ?? 8))
const STALE_MS = 15 * 60 * 1000
const DONE_TTL_MS = 24 * 60 * 60 * 1000
const DEAD_TTL_MS = 14 * 24 * 60 * 60 * 1000
const TASK_TYPES = ['anime.refresh', 'catalog.ongoing', 'catalog.backfill']
const worker = `task:${process.pid}`

class JobFailure extends Schema.TaggedError<JobFailure>()('JobFailure', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

function toJobFailure(error: unknown): JobFailure {
  return new JobFailure({ message: error instanceof Error ? error.message : String(error), cause: error })
}

function payloadString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function handle(job: JobRow): Effect.Effect<void, JobFailure, Http | AniList> {
  if (job.type === 'anime.refresh') {
    return refreshSourceBySlug(payloadString(job.payload.slug)).pipe(Effect.mapError(toJobFailure))
  }
  if (job.type === 'catalog.ongoing') {
    return runOngoingSync().pipe(Effect.mapError(toJobFailure))
  }
  if (job.type === 'catalog.backfill') {
    return runBackfill(payloadString(job.payload.sourceId)).pipe(Effect.mapError(toJobFailure))
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
    and not (
      s.metadata_state = 'unresolved'
      and s.metadata_attempts >= 3
      and s.metadata_checked_at > now() - interval '14 days'
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

function processJob(job: JobRow): Effect.Effect<void, never, Http | AniList> {
  const sourceId = sourceOf(job)
  const label = payloadString(job.payload.slug) || payloadString(job.payload.sourceId) || job.type
  return Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis
    const failure = yield* Effect.result(
      Effect.gen(function* () {
        yield* handle(job)
        yield* Effect.tryPromise({ try: () => complete(job.id), catch: toJobFailure })
        yield* recordSuccess(sourceId)
      }),
    )
    const ms = (yield* Clock.currentTimeMillis) - startedAt
    if (failure._tag === 'Success') {
      ok(`[job] ok ${label}`, { type: job.type, ms })
      return
    }
    warn(`[job] fail ${label}`, { type: job.type, ms, error: failure.failure.message })
    if (classifyError(failure.failure.cause) === 'transient') {
      const tripped = yield* recordFailure(sourceId)
      if (tripped) yield* Effect.promise(() => alert(`breaker:${sourceId}`, `circuit breaker opened for ${sourceId}`))
    } else {
      yield* recordSuccess(sourceId)
    }
    yield* Effect.promise(() => fail(job.id, failure.failure.cause))
  })
}

function drain(types: string[] = TASK_TYPES): Effect.Effect<void, never, Http | AniList> {
  return Effect.gen(function* () {
    while (true) {
      const blocked = yield* blockedSources()
      const claimed = yield* Effect.promise(() => claim(worker, BATCH, types, blocked))
      if (claimed.length === 0) return
      yield* Effect.forEach(claimed, processJob, { concurrency: JOB_CONCURRENCY, discard: true })
    }
  })
}

export function runCatalog(): Effect.Effect<void, never, Http | AniList> {
  return Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    const startedAt = new Date(now)
    yield* Effect.promise(() => releaseStale(STALE_MS))
    yield* Effect.promise(() => prune(new Date(now - DONE_TTL_MS), new Date(now - DEAD_TTL_MS)))
    yield* runOngoingSync()
    yield* Effect.forEach(getSources(), source => runBackfill(source.id), {
      concurrency: 2,
      discard: true,
    })
    yield* Effect.promise(() => seedRefreshJobs(startedAt))
    yield* drain()
  })
}

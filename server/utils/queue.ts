import { eq, sql } from 'drizzle-orm'
import { db } from './db'
import { jobs, type JobRow } from '../database/schema'

export interface JobInput {
  type: string
  payload?: Record<string, unknown>
  dedupeKey?: string
  priority?: number
  maxAttempts?: number
}

export async function enqueueMany(items: JobInput[]): Promise<void> {
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200).map(item => ({
      type: item.type,
      payload: item.payload ?? {},
      dedupeKey: item.dedupeKey ?? null,
      priority: item.priority ?? 0,
      maxAttempts: item.maxAttempts ?? 5,
    }))
    await db().insert(jobs).values(chunk).onConflictDoNothing()
  }
}

export async function enqueue(item: JobInput): Promise<void> {
  return enqueueMany([item])
}

export async function claim(worker: string, limit: number, types?: string[], excludeSources?: string[]): Promise<JobRow[]> {
  const typeFilter = types && types.length
    ? sql` and type in (${sql.join(types.map(type => sql`${type}`), sql`, `)})`
    : sql``
  const sourceFilter = excludeSources && excludeSources.length
    ? sql` and coalesce(payload->>'sourceId', split_part(payload->>'slug', ':', 1), '') not in (${sql.join(excludeSources.map(id => sql`${id}`), sql`, `)})`
    : sql``
  const result = await db().execute(sql`
    update jobs
    set status = 'active', locked_at = now(), locked_by = ${worker}, attempts = attempts + 1, updated_at = now()
    where id in (
      select id from jobs
      where status = 'waiting' and run_at <= now() ${typeFilter} ${sourceFilter}
      order by priority desc, run_at asc
      for update skip locked
      limit ${limit}
    )
    returning *
  `) as unknown as { rows: JobRow[] }
  return result.rows
}

export async function complete(id: number): Promise<void> {
  await db()
    .update(jobs)
    .set({ status: 'done', lockedAt: null, lockedBy: null, lastError: null, updatedAt: new Date() })
    .where(eq(jobs.id, id))
}

const RETRY_BASE_S = 30
const RETRY_CAP_S = 1800
const RETRY_JITTER_S = 15
const RETRY_COOLDOWN_S = 6 * 60 * 60
const PERMANENT_COOLDOWN_S = 7 * 24 * 60 * 60

export type FailureKind = 'transient' | 'permanent'

export function classifyError(message: string): FailureKind {
  if (/episode data unavailable/.test(message)) return 'permanent'
  const status = Number(message.match(/Failed to fetch .*?: (\d{3})\b/)?.[1])
  if (!status) return 'transient'
  if (status === 403 || status === 408 || status === 425 || status === 429) return 'transient'
  return status >= 400 && status < 500 ? 'permanent' : 'transient'
}

export async function fail(id: number, error: string): Promise<void> {
  const message = error.slice(0, 500)
  const permanent = classifyError(error) === 'permanent'
  const backoff = sql`least(${RETRY_BASE_S}::double precision * power(2, greatest(attempts - 1, 0)), ${RETRY_CAP_S}::double precision) + random() * ${RETRY_JITTER_S}::double precision`
  await db().execute(sql`
    update jobs set
      status = case when ${permanent} or attempts >= max_attempts then 'dead' else 'waiting' end,
      run_at = case
        when ${permanent} then now() + make_interval(secs => ${PERMANENT_COOLDOWN_S}::double precision)
        when attempts >= max_attempts then now() + make_interval(secs => ${RETRY_COOLDOWN_S}::double precision)
        else now() + make_interval(secs => ${backoff})
      end,
      locked_at = null, locked_by = null, last_error = ${message}, updated_at = now()
    where id = ${id}
  `)
}

export async function releaseStale(staleMs: number): Promise<void> {
  await db().execute(sql`
    update jobs set status = 'waiting', locked_at = null, locked_by = null, updated_at = now()
    where status = 'active' and locked_at < ${new Date(Date.now() - staleMs)}
  `)
}

export async function prune(doneBefore: Date, deadBefore: Date): Promise<void> {
  await db().execute(sql`
    delete from jobs
    where (status = 'done' and updated_at < ${doneBefore})
       or (status = 'dead' and updated_at < ${deadBefore})
  `)
}

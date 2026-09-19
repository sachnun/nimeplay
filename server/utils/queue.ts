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

export async function claim(worker: string, limit: number, types?: string[]): Promise<JobRow[]> {
  const typeFilter = types && types.length
    ? sql` and type in (${sql.join(types.map(type => sql`${type}`), sql`, `)})`
    : sql``
  const result = await db().execute(sql`
    update jobs
    set status = 'active', locked_at = now(), locked_by = ${worker}, attempts = attempts + 1, updated_at = now()
    where id in (
      select id from jobs
      where status = 'waiting' and run_at <= now() ${typeFilter}
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

export async function fail(id: number, error: string, retryDelayMs = 30_000): Promise<void> {
  const message = error.slice(0, 500)
  const retryAt = new Date(Date.now() + retryDelayMs)
  await db().execute(sql`
    update jobs set
      status = case when attempts >= max_attempts then 'failed' else 'waiting' end,
      run_at = case when attempts >= max_attempts then run_at else ${retryAt} end,
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

export async function prune(before: Date): Promise<void> {
  await db().execute(sql`delete from jobs where status = 'done' and updated_at < ${before}`)
}

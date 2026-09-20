import { sql } from 'drizzle-orm'
import { db } from './db'

const DEFAULT_TTL_MS = 90 * 1000

export interface LockHandle {
  renew: () => Promise<boolean>
  release: () => Promise<void>
}

const active = new Set<LockHandle>()

process.on('SIGINT', () => {
  void Promise.allSettled([...active].map(handle => handle.release())).then(() => process.exit(0))
})

async function take(key: string, owner: string, ttlMs: number): Promise<boolean> {
  const result = await db().execute(sql`
    insert into app_state (key, value, updated_at)
    values (${key}, ${owner}, now())
    on conflict (key) do update
      set value = excluded.value, updated_at = now()
      where app_state.updated_at < now() - make_interval(secs => ${ttlMs / 1000}::double precision)
    returning value
  `) as unknown as { rows: { value: string }[] }
  return result.rows[0]?.value === owner
}

async function touch(key: string, owner: string): Promise<boolean> {
  const result = await db().execute(sql`
    update app_state set updated_at = now()
    where key = ${key} and value = ${owner}
    returning value
  `) as unknown as { rows: { value: string }[] }
  return result.rows[0]?.value === owner
}

export async function acquireLock(key: string, ttlMs = DEFAULT_TTL_MS): Promise<LockHandle | null> {
  const owner = `${process.pid}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
  if (!await take(key, owner, ttlMs)) return null

  const handle: LockHandle = {
    renew: () => touch(key, owner),
    release: async () => {
      active.delete(handle)
      await db()
        .execute(sql`delete from app_state where key = ${key} and value = ${owner}`)
        .catch(() => {})
    },
  }
  active.add(handle)
  return handle
}

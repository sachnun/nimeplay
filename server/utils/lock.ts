import { sql } from 'drizzle-orm'
import { db } from './db'

const DEFAULT_TTL_MS = 45 * 60 * 1000

export interface LockHandle {
  touch: () => Promise<void>
  release: () => Promise<void>
}

export async function acquireLock(key: string, ttlMs = DEFAULT_TTL_MS): Promise<LockHandle | null> {
  const owner = `${process.pid}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
  const result = await db().execute(sql`
    insert into app_state (key, value, updated_at)
    values (${key}, ${owner}, now())
    on conflict (key) do update
      set value = excluded.value, updated_at = now()
      where app_state.updated_at < now() - make_interval(secs => ${ttlMs / 1000}::double precision)
    returning value
  `) as unknown as { rows: { value: string }[] }
  if (result.rows[0]?.value !== owner) return null

  return {
    touch: async () => {
      await db()
        .execute(sql`update app_state set updated_at = now() where key = ${key} and value = ${owner}`)
        .catch(() => {})
    },
    release: async () => {
      await db()
        .execute(sql`delete from app_state where key = ${key} and value = ${owner}`)
        .catch(() => {})
    },
  }
}

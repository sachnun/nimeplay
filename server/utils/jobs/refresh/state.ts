import { eq, sql } from 'drizzle-orm'
import { appState } from '../../../database/schema'
import { db } from '../../db'

const SYNC_STALE_MS = 4 * 60 * 1000

const syncStartedAt = new Map<string, number>()

export function acquireSync(name: string): boolean {
  const startedAt = syncStartedAt.get(name)
  if (startedAt !== undefined && Date.now() - startedAt < SYNC_STALE_MS) return false
  syncStartedAt.set(name, Date.now())
  return true
}

export function releaseSync(name: string): void {
  syncStartedAt.delete(name)
}

export async function getAppState(key: string): Promise<string | null> {
  const [row] = await db()
    .select({ value: appState.value })
    .from(appState)
    .where(eq(appState.key, key))
    .limit(1)
  return row?.value ?? null
}

export async function setAppState(key: string, value: string): Promise<void> {
  await db().execute(sql`insert into app_state (key, value, updated_at)
    values (${key}, ${value}, now())
    on conflict (key) do update set value = ${value}, updated_at = now()`)
}

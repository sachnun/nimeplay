import { Effect, HashMap, Option, Ref } from 'effect'
import { eq, sql } from 'drizzle-orm'
import { appState } from '../../../database/schema'
import { db } from '../../db'

const SYNC_STALE_MS = 4 * 60 * 1000

const syncStartedAt = Ref.makeUnsafe(HashMap.empty<string, number>())

export function acquireSync(name: string): boolean {
  const now = Date.now()
  return Effect.runSync(
    Ref.modify(syncStartedAt, map => {
      const previous = HashMap.get(map, name)
      if (Option.isSome(previous) && now - previous.value < SYNC_STALE_MS) return [false, map]
      return [true, HashMap.set(map, name, now)]
    }),
  )
}

export function releaseSync(name: string): void {
  Effect.runSync(Ref.update(syncStartedAt, map => HashMap.remove(map, name)))
}

export async function getAppState(key: string): Promise<string | null> {
  const [row] = await db().select({ value: appState.value }).from(appState).where(eq(appState.key, key)).limit(1)
  return row?.value ?? null
}

export async function setAppState(key: string, value: string): Promise<void> {
  await db().execute(sql`insert into app_state (key, value, updated_at)
    values (${key}, ${value}, now())
    on conflict (key) do update set value = ${value}, updated_at = now()`)
}

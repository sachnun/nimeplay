import { getDb } from './db'

async function migrateFromLocalStorage() {
  if (!import.meta.client) return
  try {
    const db = await getDb()
    const count = await db.count('jikan')
    if (count > 0) return

    const oldData = localStorage.getItem('nimeplay:jikan')
    if (!oldData) return

    const map: Record<string, number> = JSON.parse(oldData)
    const tx = db.transaction('jikan', 'readwrite')
    await Promise.all(
      Object.entries(map).map(([key, value]) => tx.store.put(value, key)),
    )
    await tx.done
  } catch (error) {
    console.warn('jikanCache.migrateFromLocalStorage failed', error)
  }
}

let migrated = false
function ensureMigrated() {
  if (!migrated) {
    migrated = true
    void migrateFromLocalStorage()
  }
}

export async function getMalId(animeSlug: string): Promise<number | null> {
  if (!import.meta.client) return null
  ensureMigrated()
  try {
    const db = await getDb()
    return (await db.get('jikan', animeSlug)) ?? null
  } catch {
    return null
  }
}

export async function saveMalId(animeSlug: string, malId: number): Promise<void> {
  if (!import.meta.client) return
  const db = await getDb()
  await db.put('jikan', malId, animeSlug)
}

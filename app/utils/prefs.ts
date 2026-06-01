import { getDb } from './db'

async function migrateFromLocalStorage() {
  if (!import.meta.client) return
  try {
    const db = await getDb()
    const existing = await db.get('prefs', 'autoskip')
    if (existing !== undefined) return

    const oldValue = localStorage.getItem('nimeplay:autoskip')
    if (oldValue !== null) {
      await db.put('prefs', oldValue, 'autoskip')
    }
  } catch (error) {
    console.warn('prefs.migrateFromLocalStorage failed', error)
  }
}

let migrated = false
function ensureMigrated() {
  if (!migrated) {
    migrated = true
    void migrateFromLocalStorage()
  }
}

export async function getAutoSkip(): Promise<boolean> {
  if (!import.meta.client) return false
  ensureMigrated()
  try {
    const db = await getDb()
    const val = await db.get('prefs', 'autoskip')
    return val === '1'
  } catch {
    return false
  }
}

export async function setAutoSkip(value: boolean): Promise<void> {
  if (!import.meta.client) return
  const db = await getDb()
  await db.put('prefs', value ? '1' : '0', 'autoskip')
}

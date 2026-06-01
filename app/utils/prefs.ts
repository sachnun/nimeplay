import { getDb } from './db'

export async function getAutoSkip(): Promise<boolean> {
  if (!import.meta.client) return false
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

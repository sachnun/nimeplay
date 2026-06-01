import { getDb } from './db'

export async function getMalId(animeSlug: string): Promise<number | null> {
  if (!import.meta.client) return null
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

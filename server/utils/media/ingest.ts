import { inArray } from 'drizzle-orm'
import { db } from '../db'
import { media } from '../../database/schema'
import { fetchRemoteMedia, storeMedia } from './store'
import { warn } from '../log'
import type { MediaRef } from './index'

async function ingestOne(ref: MediaRef): Promise<string | null> {
  try {
    const { contentType, bytes } = await fetchRemoteMedia(ref.sourceUrl)
    await storeMedia(ref.key, bytes, contentType)
    await db().insert(media).values({ key: ref.key, sourceUrl: ref.sourceUrl }).onConflictDoNothing()
    return ref.key
  }
  catch (error) {
    warn(`[ingest] failed ${ref.key}`, { error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

export async function ingestMedia(refs: MediaRef[]): Promise<Map<string, string>> {
  const unique = [...new Map(refs.map(ref => [ref.sourceUrl, ref])).values()]
  const keys = new Map<string, string>()
  if (unique.length === 0) return keys

  const existing = await db()
    .select({ sourceUrl: media.sourceUrl, key: media.key })
    .from(media)
    .where(inArray(media.sourceUrl, unique.map(ref => ref.sourceUrl)))
  for (const row of existing) keys.set(row.sourceUrl, row.key)

  const missing = unique.filter(ref => !keys.has(ref.sourceUrl))
  await Promise.all(missing.map(async (ref) => {
    const key = await ingestOne(ref)
    if (key) keys.set(ref.sourceUrl, key)
  }))
  return keys
}

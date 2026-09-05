import { eq, sql } from 'drizzle-orm'
import { anime } from '../database/schema'
import { db } from './db'
import {
  fetchRemoteMedia,
  hasCachedMedia,
  isValidMediaKey,
  keyToOrigin,
  r2Bucket,
  storeMedia,
  toR2Url,
} from './r2'

const CONCURRENCY = 15

export async function mirrorMediaItem(r2Path: string): Promise<boolean> {
  const key = r2Path.startsWith('/r2/') ? r2Path.slice(4) : r2Path
  if (!isValidMediaKey(key)) return false

  const bucket = r2Bucket()
  if (!bucket) return false

  if (await hasCachedMedia(key)) return true

  const origin = keyToOrigin(key)
  if (!origin) return false

  try {
    const { contentType, bytes } = await fetchRemoteMedia(origin)
    await storeMedia(key, bytes, contentType)
    return true
  }
  catch {
    return false
  }
}

export async function mirrorAnimeMedia(posterPath: string | null, characters: any[]): Promise<void> {
  const tasks: string[] = []
  if (posterPath && posterPath.startsWith('/r2/')) {
    tasks.push(posterPath)
  }

  for (const c of characters) {
    if (c.imageUrl && c.imageUrl.startsWith('/r2/')) tasks.push(c.imageUrl)
    if (c.voiceActor?.imageUrl && c.voiceActor.imageUrl.startsWith('/r2/')) tasks.push(c.voiceActor.imageUrl)
  }

  if (tasks.length === 0) return

  let idx = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
    while (idx < tasks.length) {
      const item = tasks[idx++]
      if (!item) break
      await mirrorMediaItem(item)
    }
  })
  await Promise.all(workers)
}

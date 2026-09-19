import { eq } from 'drizzle-orm'
import { db } from './db'
import { media } from '../database/schema'
import { fetchRemoteMedia, storeMedia } from './media-store'
import type { MediaRef } from './media'

export async function mirrorMedia(ref: MediaRef): Promise<void> {
  const [existing] = await db()
    .select({ key: media.key })
    .from(media)
    .where(eq(media.sourceUrl, ref.sourceUrl))
    .limit(1)
  if (existing) return
  const { contentType, bytes } = await fetchRemoteMedia(ref.sourceUrl)
  await storeMedia(ref.key, bytes, contentType)
  await db().insert(media).values({ key: ref.key, sourceUrl: ref.sourceUrl }).onConflictDoNothing()
}

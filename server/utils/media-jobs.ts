import type { JobRow } from '../database/schema'
import { claim, complete, fail, prune, releaseStale } from './queue'
import { mirrorMedia } from './media-mirror'
import type { MediaRef } from './media'

const WALL_MS = 5 * 60 * 1000
const BATCH = 8
const STALE_MS = 10 * 60 * 1000
const DONE_TTL_MS = 24 * 60 * 60 * 1000
const DEAD_TTL_MS = 14 * 24 * 60 * 60 * 1000
const MEDIA_TYPES = ['media.mirror']
const worker = `media:${process.pid}`

async function handle(job: JobRow): Promise<void> {
  if (job.type === 'media.mirror') {
    const { key, sourceUrl } = job.payload as unknown as MediaRef
    if (!key || !sourceUrl) throw new Error('invalid media.mirror payload')
    await mirrorMedia({ key, sourceUrl })
    return
  }
  throw new Error(`unknown job type: ${job.type}`)
}

async function drain(deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    const claimed = await claim(worker, BATCH, MEDIA_TYPES)
    if (claimed.length === 0) return
    await Promise.all(claimed.map(async (job) => {
      try {
        await handle(job)
        await complete(job.id)
      }
      catch (error) {
        await fail(job.id, error instanceof Error ? error.message : String(error))
      }
    }))
  }
}

export async function runMediaTick(): Promise<void> {
  const deadline = Date.now() + WALL_MS
  await releaseStale(STALE_MS)
  await prune(new Date(Date.now() - DONE_TTL_MS), new Date(Date.now() - DEAD_TTL_MS))
  await drain(deadline)
}

import type { JobRow } from '../database/schema'
import { claim, complete, enqueue, enqueueMany, fail, prune, releaseStale } from './queue'
import { listRefreshCandidates, refreshAnimeBySlug, runFinishedSync, runOngoingSync } from './refresh'

const WALL_MS = 13 * 60 * 1000
const BATCH = 16
const STALE_MS = 10 * 60 * 1000
const DONE_TTL_MS = 24 * 60 * 60 * 1000
const worker = `task:${process.pid}`

async function handle(job: JobRow): Promise<void> {
  if (job.type === 'anime.refresh') {
    await refreshAnimeBySlug(String(job.payload.slug ?? ''), true)
    return
  }
  if (job.type === 'catalog.ongoing') {
    await runOngoingSync()
    return
  }
  if (job.type === 'catalog.backfill') {
    await runFinishedSync()
    return
  }
  throw new Error(`unknown job type: ${job.type}`)
}

async function seedFocus(): Promise<void> {
  const slugs = await listRefreshCandidates(2000)
  await enqueueMany(slugs.map(slug => ({
    type: 'anime.refresh',
    payload: { slug },
    dedupeKey: `anime.refresh:${slug}`,
  })))
}

async function drain(deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    const claimed = await claim(worker, BATCH)
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

export async function runTick(): Promise<void> {
  const deadline = Date.now() + WALL_MS
  await releaseStale(STALE_MS)
  await prune(new Date(Date.now() - DONE_TTL_MS))
  await seedFocus()
  await drain(deadline)
}

export async function runCatalog(): Promise<void> {
  const deadline = Date.now() + WALL_MS
  await releaseStale(STALE_MS)
  await enqueue({ type: 'catalog.ongoing', dedupeKey: 'catalog.ongoing' })
  await enqueue({ type: 'catalog.backfill', dedupeKey: 'catalog.backfill' })
  await seedFocus()
  await drain(deadline)
}

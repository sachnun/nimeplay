import type { JobRow } from '../database/schema'
import { claim, complete, fail, prune, releaseStale } from './queue'
import { mirrorMedia } from './media-mirror'
import type { MediaRef } from './media'
import type { LockHandle } from './lock'
import { cpuMeter, type CpuBudget } from './budget'

const WALL_MS = 6 * 60 * 1000
const BATCH = 4
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

async function processJob(job: JobRow, lease: LockHandle): Promise<boolean> {
  const sample = cpuMeter()
  let held = true
  try {
    await handle(job)
    await complete(job.id, Math.round(sample() * 1e6))
  }
  catch (error) {
    await fail(job.id, error instanceof Error ? error.message : String(error), Math.round(sample() * 1e6))
  }
  finally {
    held = await lease.renew()
  }
  return held
}

async function drain(deadline: number, lease: LockHandle, budget: CpuBudget): Promise<void> {
  while (Date.now() < deadline) {
    if (!await lease.renew()) return
    const claimed = await claim(worker, BATCH, MEDIA_TYPES)
    if (claimed.length === 0) return
    const held = await Promise.all(claimed.map(job => processJob(job, lease)))
    if (!await budget.spend()) return
    if (held.includes(false)) return
  }
}

export async function runMediaTick(lease: LockHandle, budget: CpuBudget): Promise<void> {
  const deadline = Date.now() + WALL_MS
  await releaseStale(STALE_MS)
  await prune(new Date(Date.now() - DONE_TTL_MS), new Date(Date.now() - DEAD_TTL_MS))
  await drain(deadline, lease, budget)
}

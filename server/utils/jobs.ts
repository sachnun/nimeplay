import { cloudflareEnv } from './env'
import { mirrorMediaQueue, runEpisodesFill, runFinishedSync, runMetadataSync, runOngoingSync } from './refresh'

export type JobKind = 'ongoing' | 'completed' | 'media'
export interface JobMessage { kind: JobKind }

interface JobQueue {
  send(body: JobMessage, options?: { delaySeconds?: number }): Promise<void>
}

const METADATA_JOB_LIMIT = 200
const MEDIA_CONTINUE_DELAY_S = 5

function jobsQueue(): JobQueue | undefined {
  const value = cloudflareEnv().JOBS
  return typeof value === 'object' && value !== null && 'send' in value ? value as JobQueue : undefined
}

export async function sendJob(kind: JobKind, delaySeconds?: number): Promise<void> {
  const queue = jobsQueue()
  if (!queue) {
    console.warn(`[jobs] JOBS queue not bound, skipping ${kind}`)
    return
  }
  await queue.send({ kind }, delaySeconds ? { delaySeconds } : undefined)
}

async function runOngoingJob(): Promise<void> {
  await runOngoingSync()
  await runEpisodesFill()
  await runMetadataSync({ limit: METADATA_JOB_LIMIT, scope: 'ongoing' })
  await sendJob('media')
}

async function runCompletedJob(): Promise<void> {
  await runFinishedSync()
  await runMetadataSync({ limit: METADATA_JOB_LIMIT, scope: 'all' })
  await sendJob('media')
}

async function runMediaJob(): Promise<void> {
  const { pending } = await mirrorMediaQueue()
  if (pending > 0) await sendJob('media', MEDIA_CONTINUE_DELAY_S)
}

export function runJob(kind: JobKind): Promise<void> {
  if (kind === 'ongoing') return runOngoingJob()
  if (kind === 'completed') return runCompletedJob()
  return runMediaJob()
}

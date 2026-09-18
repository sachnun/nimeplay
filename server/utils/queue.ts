import { cloudflareEnv } from './env'

export type JobKind = 'ongoing' | 'completed' | 'media'
export interface JobMessage { kind: JobKind }

interface JobQueue {
  send(body: JobMessage, options?: { delaySeconds?: number }): Promise<void>
}

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

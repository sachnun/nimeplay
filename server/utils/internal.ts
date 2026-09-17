import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'

export const INTERNAL_KEY = 'nimeplay'
export const WORKER_ORIGIN = 'https://nimeplay-nuxt.sachnun.workers.dev'

export function assertInternal(event: H3Event): void {
  if (getHeader(event, 'x-nimeplay-key') !== INTERNAL_KEY) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
}

export async function triggerInternal(
  task: 'catalog-sync' | 'metadata-sync',
  fallback: () => Promise<void>,
): Promise<void> {
  if (import.meta.dev) return fallback()
  const res = await fetch(`${WORKER_ORIGIN}/api/internal/cron/${task}`, {
    method: 'POST',
    headers: { 'x-nimeplay-key': INTERNAL_KEY },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`internal ${task} failed: ${res.status}`)
}

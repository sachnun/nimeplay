import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'
import { cloudflareEnv } from './env'

export const INTERNAL_KEY = 'nimeplay'

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
  const origin = cloudflareEnv().APP_ORIGIN
  if (typeof origin !== 'string' || !origin) {
    console.warn(`[cron] APP_ORIGIN unknown, running ${task} inline`)
    return fallback()
  }
  const res = await fetch(`${origin}/api/internal/cron/${task}`, {
    method: 'POST',
    headers: { 'x-nimeplay-key': INTERNAL_KEY },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`internal ${task} failed: ${res.status}`)
}

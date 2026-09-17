import type { H3Event } from 'h3'
import { createError, getHeader, getRequestURL } from 'h3'
import { kvNamespace } from './kv'

export const INTERNAL_KEY = 'nimeplay'
const ORIGIN_KEY = 'nimeplay:v1:internal_origin'

let knownOrigin: string | null = null

export function assertInternal(event: H3Event): void {
  if (getHeader(event, 'x-nimeplay-key') !== INTERNAL_KEY) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
}

export function rememberOrigin(event: H3Event): void {
  const origin = getRequestURL(event).origin
  if (knownOrigin === origin) return
  knownOrigin = origin
  const kv = kvNamespace()
  if (!kv) return
  const task = kv.put(ORIGIN_KEY, origin).catch(() => {})
  const waitUntil = (event as H3Event & { waitUntil?: (p: Promise<unknown>) => void }).waitUntil
  if (waitUntil) waitUntil(task)
  else task.catch(() => {})
}

async function resolveOrigin(): Promise<string | null> {
  if (knownOrigin) return knownOrigin
  const kv = kvNamespace()
  const stored = kv ? await kv.get(ORIGIN_KEY, 'text') : null
  knownOrigin = stored ?? null
  return knownOrigin
}

export async function triggerInternal(
  task: 'catalog-sync' | 'metadata-sync',
  fallback: () => Promise<void>,
): Promise<void> {
  if (import.meta.dev) return fallback()
  const origin = await resolveOrigin()
  if (!origin) {
    console.warn(`[cron] origin unknown, running ${task} inline`)
    return fallback()
  }
  const res = await fetch(`${origin}/api/internal/cron/${task}`, {
    method: 'POST',
    headers: { 'x-nimeplay-key': INTERNAL_KEY },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`internal ${task} failed: ${res.status}`)
}

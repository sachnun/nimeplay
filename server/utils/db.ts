import type { D1Database as D1 } from '@miniflare/d1'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../database/schema'

interface WorkerEnv {
  DB?: unknown
}

function binding(): D1 {
  const env = (globalThis as { __env__?: WorkerEnv }).__env__
  const value = env?.DB
  if (!value) throw new Error('D1 binding "DB" is not available (run inside a Worker or with wrangler dev emulation)')
  return value as D1
}

/** Singleton Drizzle client backed by the Cloudflare D1 binding. */
export function db() {
  return drizzle(binding(), { schema })
}

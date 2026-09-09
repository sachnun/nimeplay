import type { D1Database } from '@cloudflare/workers-types'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../database/schema'
import { cloudflareEnv } from './env'

function binding(): D1Database {
  const value = cloudflareEnv().DB
  if (!value) throw new Error('D1 binding "DB" is not available (run inside a Worker or with wrangler dev emulation)')
  return value as D1Database
}

export function db() {
  return drizzle(binding(), { schema })
}

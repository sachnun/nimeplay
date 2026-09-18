import { neon, neonConfig, Pool } from '@neondatabase/serverless'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { drizzle as httpDrizzle } from 'drizzle-orm/neon-http'
import { drizzle as wsDrizzle } from 'drizzle-orm/neon-serverless'
import * as schema from '../database/schema'
import { cloudflareEnv } from './env'

type Database = NeonHttpDatabase<typeof schema>

const QUERY_TIMEOUT_MS = 15000

neonConfig.fetchFunction = ((input: RequestInfo | URL, init?: RequestInit) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) })) as typeof fetch

const store = new AsyncLocalStorage<Database>()
let http: Database | undefined

function connectionString(): string {
  const value = cloudflareEnv().DATABASE_URL
  if (typeof value !== 'string' || !value) throw new Error('DATABASE_URL is not set')
  return value
}

export function db(): Database {
  const scoped = store.getStore()
  if (scoped) return scoped
  if (!http) http = httpDrizzle(neon(connectionString()), { schema })
  return http
}

export async function withPool<T>(fn: () => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: connectionString() })
  const client = wsDrizzle(pool, { schema }) as unknown as Database
  try {
    return await store.run(client, fn)
  }
  finally {
    await pool.end().catch(() => {})
  }
}

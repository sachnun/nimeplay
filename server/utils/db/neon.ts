import { neon, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from '../../database/schema'
import { setDatabaseFactory } from './index'
import { cloudflareEnv } from '../env'

const QUERY_TIMEOUT_MS = 15000

neonConfig.fetchFunction = ((input: RequestInfo | URL, init?: RequestInit) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) })) as typeof fetch

function connectionString(): string {
  const value = cloudflareEnv().DATABASE_URL
  if (typeof value !== 'string' || !value) throw new Error('DATABASE_URL is not set')
  return value
}

export function registerNeonDatabase(): void {
  setDatabaseFactory(() => drizzle(neon(connectionString()), { schema }))
}

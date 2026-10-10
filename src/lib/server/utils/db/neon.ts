import { neon, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from '../../database/schema'
import { requireEnv } from '../env'
import { setDatabaseFactory } from './index'

const QUERY_TIMEOUT_MS = 15000

neonConfig.fetchFunction = ((input: RequestInfo | URL, init?: RequestInit) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) })) as typeof fetch

export function registerNeonDatabase(): void {
  setDatabaseFactory(() => drizzle(neon(requireEnv('DATABASE_URL')), { schema }))
}

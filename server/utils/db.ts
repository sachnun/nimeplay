import { neon, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from '../database/schema'

let client: ReturnType<typeof createClient> | null = null

function createClient() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  // Local test setup: route the driver through the Neon HTTP proxy
  // (see docker-compose.local.yml) instead of the cloud endpoint.
  if (/@(localhost|127\.0\.0\.1)/.test(url)) {
    neonConfig.fetchEndpoint = process.env.NEON_PROXY_URL ?? 'http://localhost:4444/sql'
  }

  return drizzle(neon(url), { schema })
}

/** Singleton Drizzle client backed by the Neon HTTP driver. */
export function db() {
  client ??= createClient()
  return client
}

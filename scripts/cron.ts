import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '../server/database/schema'
import { setNodeDatabase } from '../server/utils/db'
import { enableProxy } from '../server/utils/media/proxy'
import { loadOfflineIndex } from '../server/utils/mal/offline'
import { runCatalog } from '../server/utils/jobs'
import { error as logError, log } from '../server/utils/log'

const POOL_MAX = 32

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: POOL_MAX })
setNodeDatabase(drizzle(pool, { schema }))
enableProxy()

const startedAt = Date.now()
log('[run] start', { sha: process.env.GITHUB_SHA?.slice(0, 7) ?? 'local' })
try {
  await loadOfflineIndex().catch(() => null)
  await runCatalog()
  log('[run] done', { ms: Date.now() - startedAt })
}
catch (error) {
  logError('[run] failed', { error: error instanceof Error ? error.message : String(error) })
  process.exitCode = 1
}
finally {
  await pool.end().catch(() => {})
}

import { SQL } from 'bun'
import { drizzle } from 'drizzle-orm/bun-sql'
import * as schema from '../server/database/schema'
import { setNodeDatabase } from '../server/utils/db'
import { runCatalog } from '../server/utils/jobs'
import { log, error as logError } from '../server/utils/log'
import { loadOfflineIndex } from '../server/utils/mal/offline'
import { enableProxy } from '../server/utils/media/proxy'

const POOL_MAX = 32

const client = new SQL({ url: process.env.DATABASE_URL!, max: POOL_MAX })
setNodeDatabase(drizzle({ client, schema }))
enableProxy()

const startedAt = Date.now()
log('[run] start', { sha: process.env.GITHUB_SHA?.slice(0, 7) ?? 'local' })
try {
  await loadOfflineIndex().catch(() => null)
  await runCatalog()
  log('[run] done', { ms: Date.now() - startedAt })
} catch (error) {
  logError('[run] failed', { error: error instanceof Error ? error.message : String(error) })
  process.exitCode = 1
} finally {
  await client.close().catch(() => {})
}

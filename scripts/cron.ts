import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '../server/database/schema'
import { setNodeDatabase } from '../server/utils/db'
import { acquireLock } from '../server/utils/jobs/lock'
import { enableProxy } from '../server/utils/media/proxy'
import { runCatalog, runTick } from '../server/utils/jobs'
import { runMediaTick } from '../server/utils/media/jobs'
import { error as logError, log } from '../server/utils/log'

const TICK_MS = 6 * 60_000
const CATALOG_MS = 30 * 60_000
const RUN_MS = 350 * 60_000
const POOL_MAX = 32

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: POOL_MAX })
setNodeDatabase(drizzle(pool, { schema }))
enableProxy()

let stopping = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { stopping = true })
}

const handle = await acquireLock('lock:cron:run')
if (!handle) {
  log('[loop] another run holds the lock, exiting')
  await pool.end()
  process.exit(0)
}

const deadline = Date.now() + RUN_MS
let lastCatalog = 0
log('[loop] start', { sha: process.env.GITHUB_SHA?.slice(0, 7) ?? 'local', tickMs: TICK_MS, catalogMs: CATALOG_MS, runMs: RUN_MS })

try {
  while (!stopping && Date.now() < deadline) {
    const startedAt = Date.now()
    const catalog = startedAt - lastCatalog >= CATALOG_MS
    if (catalog) lastCatalog = startedAt
    try {
      await Promise.allSettled([catalog ? runCatalog() : runTick(), runMediaTick()])
    }
    catch (error) {
      logError('[loop] iteration failed', { error: error instanceof Error ? error.message : String(error) })
    }
    log('[loop] iter', { catalog, ms: Date.now() - startedAt })
    await handle.touch()
    const wait = TICK_MS - (Date.now() - startedAt)
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
  }
}
finally {
  log('[loop] stop', { reason: stopping ? 'signal' : 'deadline' })
  await handle.release().catch(() => {})
  await pool.end().catch(() => {})
}

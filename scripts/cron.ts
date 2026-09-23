import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '../server/database/schema'
import { setNodeDatabase } from '../server/utils/db'
import { acquireLock } from '../server/utils/jobs/lock'
import { enableProxy } from '../server/utils/media/proxy'
import { runCatalog, runTick } from '../server/utils/jobs'
import { runMediaTick } from '../server/utils/media/jobs'

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
  console.log('[loop] another run holds the lock, exiting')
  await pool.end()
  process.exit(0)
}

const deadline = Date.now() + RUN_MS
let lastCatalog = 0

try {
  while (!stopping && Date.now() < deadline) {
    const startedAt = Date.now()
    const catalog = startedAt - lastCatalog >= CATALOG_MS
    if (catalog) lastCatalog = startedAt
    try {
      await Promise.allSettled([catalog ? runCatalog() : runTick(), runMediaTick()])
    }
    catch (error) {
      console.error('[loop] iteration failed:', error instanceof Error ? error.message : error)
    }
    await handle.touch()
    const wait = TICK_MS - (Date.now() - startedAt)
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
  }
}
finally {
  await handle.release().catch(() => {})
  await pool.end().catch(() => {})
}

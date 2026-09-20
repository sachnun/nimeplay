import { attachDatabasePool, waitUntil } from '@neon/functions'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '../server/database/schema'
import { setNodeDatabase } from '../server/utils/db'
import { acquireLock, type LockHandle } from '../server/utils/lock'
import { runCatalog, runTick } from '../server/utils/jobs'

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 12 })
attachDatabasePool(pool)
setNodeDatabase(drizzle(pool, { schema }))

const tasks: Record<string, { run: () => Promise<void>, lock: string }> = {
  '/tick': { run: runTick, lock: 'lock:task:tick' },
  '/catalog': { run: runCatalog, lock: 'lock:task:catalog' },
}

export default async function handler(request: Request): Promise<Response> {
  if (!request.headers.has('x-neon-trigger-invocation-id')) {
    return new Response('forbidden', { status: 403 })
  }
  const task = tasks[new URL(request.url).pathname]
  if (!task) return new Response('not found', { status: 404 })

  let handle: LockHandle | null
  try {
    handle = await acquireLock(task.lock)
  }
  catch (error) {
    console.error('[task] lock failed:', error instanceof Error ? error.message : error)
    return Response.json({ statusMessage: 'lock failed' }, { status: 500 })
  }
  if (!handle) return Response.json({ result: 'busy' })

  waitUntil((async () => {
    try {
      await task.run()
    }
    catch (error) {
      console.error('[task] failed:', error instanceof Error ? error.message : error)
    }
    finally {
      await handle.release()
    }
  })())

  return Response.json({ result: 'started' })
}

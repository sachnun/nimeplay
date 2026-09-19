import { attachDatabasePool, waitUntil } from '@neon/functions'
import { Pool, type PoolClient } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '../server/database/schema'
import { setNodeDatabase } from '../server/utils/db'
import { runMediaTick } from '../server/utils/media-jobs'

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 })
attachDatabasePool(pool)
setNodeDatabase(drizzle(pool, { schema }))

const tasks: Record<string, { run: () => Promise<void>, lock: number }> = {
  '/tick': { run: runMediaTick, lock: 728193003 },
}

export default async function handler(request: Request): Promise<Response> {
  if (!request.headers.has('x-neon-trigger-invocation-id')) {
    return new Response('forbidden', { status: 403 })
  }
  const task = tasks[new URL(request.url).pathname]
  if (!task) return new Response('not found', { status: 404 })

  let client: PoolClient | undefined
  try {
    client = await pool.connect()
    const { rows } = await client.query<{ ok: boolean }>('select pg_try_advisory_lock($1::bigint) as ok', [task.lock])
    if (!rows[0]?.ok) {
      client.release()
      return Response.json({ result: 'busy' })
    }
  }
  catch (error) {
    client?.release()
    console.error('[media] lock failed:', error instanceof Error ? error.message : error)
    return Response.json({ statusMessage: 'lock failed' }, { status: 500 })
  }

  const locked = client
  waitUntil((async () => {
    try {
      await task.run()
    }
    catch (error) {
      console.error('[media] failed:', error instanceof Error ? error.message : error)
    }
    finally {
      await locked.query('select pg_advisory_unlock($1::bigint)', [task.lock]).catch(() => {})
      locked.release()
    }
  })())

  return Response.json({ result: 'started' })
}

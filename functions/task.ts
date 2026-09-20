import { attachDatabasePool, waitUntil } from '@neon/functions'
import { parseTriggerInvocation } from '@neon/functions/triggers'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '../server/database/schema'
import { setNodeDatabase } from '../server/utils/db'
import { acquireLock, type LockHandle } from '../server/utils/lock'
import { budgetOk, cpuBudget, type CpuBudget } from '../server/utils/budget'
import { runCatalog, runTick } from '../server/utils/jobs'

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 12 })
attachDatabasePool(pool)
setNodeDatabase(drizzle(pool, { schema }))

const tasks: Record<string, { run: (lease: LockHandle, budget: CpuBudget) => Promise<void>, lock: string, meter: string }> = {
  '/tick': { run: runTick, lock: 'lock:task:tick', meter: 'tick' },
  '/catalog': { run: runCatalog, lock: 'lock:task:catalog', meter: 'catalog' },
}

export default async function handler(request: Request): Promise<Response> {
  const parsed = await parseTriggerInvocation(request)
  if (!parsed.ok) return new Response(parsed.error, { status: parsed.error === 'invalid_body' ? 400 : 401 })

  const task = tasks[new URL(request.url).pathname]
  if (!task) return new Response('not found', { status: 404 })

  if (!await budgetOk(task.meter)) {
    console.warn('[task] cpu budget exhausted', task.meter)
    return Response.json({ result: 'budget' })
  }

  let handle: LockHandle | null
  try {
    handle = await acquireLock(task.lock)
  }
  catch (error) {
    console.error('[task] lock failed:', error instanceof Error ? error.message : error)
    return Response.json({ statusMessage: 'lock failed' }, { status: 500 })
  }
  if (!handle) return Response.json({ result: 'busy' })
  const lease = handle
  const budget = cpuBudget(task.meter)
  const scheduledAt = parsed.invocation.data.scheduledAt

  waitUntil((async () => {
    try {
      console.log('[task] started', scheduledAt)
      await task.run(lease, budget)
    }
    catch (error) {
      console.error('[task] failed:', error instanceof Error ? error.message : error)
    }
    finally {
      await budget.spend().catch(() => {})
      await budget.report().catch(() => {})
      await lease.release()
    }
  })())

  return Response.json({ result: 'started', scheduledAt })
}

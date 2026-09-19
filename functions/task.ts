import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '../server/database/schema'
import { setNodeDatabase } from '../server/utils/db'
import { runCatalog, runTick } from '../server/utils/jobs'

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
setNodeDatabase(drizzle(pool, { schema }))

const routes: Record<string, () => Promise<void>> = {
  '/tick': runTick,
  '/catalog': runCatalog,
}

export default async function handler(request: Request): Promise<Response> {
  if (!request.headers.get('x-neon-trigger-invocation-id')) {
    return new Response('forbidden', { status: 403 })
  }
  const run = routes[new URL(request.url).pathname]
  if (!run) return new Response('not found', { status: 404 })
  try {
    await run()
    return Response.json({ result: 'ok' })
  }
  catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

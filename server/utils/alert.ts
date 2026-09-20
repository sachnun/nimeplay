import { sql } from 'drizzle-orm'
import { db } from './db'

const COOLDOWN_MS = 30 * 60 * 1000
const WEBHOOK_TIMEOUT_MS = 5000

async function claim(key: string): Promise<boolean> {
  const result = await db().execute(sql`
    insert into app_state (key, value, updated_at)
    values (${`alert:${key}`}, '', now())
    on conflict (key) do update
      set value = '', updated_at = now()
      where app_state.updated_at < now() - make_interval(secs => ${COOLDOWN_MS / 1000}::double precision)
    returning key
  `) as unknown as { rows: unknown[] }
  return result.rows.length > 0
}

export async function alert(key: string, message: string, fields?: Record<string, unknown>): Promise<void> {
  try {
    if (!await claim(key)) return
  }
  catch (error) {
    console.error('[alert] claim failed:', error instanceof Error ? error.message : error)
    return
  }

  console.warn(`[alert] ${message}`, fields ? JSON.stringify(fields) : '')

  const webhook = process.env.ALERT_WEBHOOK_URL
  if (!webhook) return

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `[nimeplay] ${message}`, key, fields }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    })
  }
  catch (error) {
    console.error('[alert] webhook failed:', error instanceof Error ? error.message : error)
  }
}

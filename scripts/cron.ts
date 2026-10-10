import { SQL } from 'bun'
import { BunRuntime } from '@effect/platform-bun'
import { Cause, Clock, Effect } from 'effect'
import { drizzle } from 'drizzle-orm/bun-sql'
import * as schema from '../src/lib/server/database/schema'
import { setNodeDatabase } from '../src/lib/server/utils/db'
import { runCatalog } from '../src/lib/server/utils/jobs'
import { enableProxy } from '../src/lib/server/utils/media/proxy'
import { NetStatsService } from '../src/lib/server/utils/net/stats'
import { AppLayer } from '../src/lib/server/utils/runtime'

const POOL_MAX = 32

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is not set')

const client = new SQL({ url: databaseUrl, max: POOL_MAX })
setNodeDatabase(drizzle({ client, schema }))
enableProxy()

function closeClient(): void {
  void client.close().catch(() => {})
}

const program = Effect.gen(function* () {
  const stats = yield* NetStatsService
  const startedAt = yield* Clock.currentTimeMillis
  yield* Effect.logInfo('[run] start', { sha: process.env.GITHUB_SHA?.slice(0, 7) ?? 'local' })
  yield* runCatalog()
  yield* Effect.logInfo('[run] net', yield* stats.stats)
  yield* Effect.logInfo('[run] done', { ms: (yield* Clock.currentTimeMillis) - startedAt })
}).pipe(
  Effect.provide(AppLayer),
  Effect.tapCause(cause =>
    Effect.sync(() => {
      console.error('[run] fatal', Cause.pretty(cause))
    }),
  ),
  Effect.ensuring(
    Effect.sync(() => {
      closeClient()
    }),
  ),
)

BunRuntime.runMain(program, { disableErrorReporting: true })

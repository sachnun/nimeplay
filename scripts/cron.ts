import { SQL } from 'bun'
import { BunRuntime } from '@effect/platform-bun'
import { Cause, Clock, Effect } from 'effect'
import { drizzle } from 'drizzle-orm/bun-sql'
import * as schema from '../server/database/schema'
import { setNodeDatabase } from '../server/utils/db'
import { runCatalog } from '../server/utils/jobs'
import { enableProxy } from '../server/utils/media/proxy'
import { NetStatsService } from '../server/utils/net/stats'
import { AppLayer } from '../server/utils/runtime'

const POOL_MAX = 32

const databaseUrl = process.env.NUXT_DATABASE_URL
if (!databaseUrl) throw new Error('NUXT_DATABASE_URL is not set')

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

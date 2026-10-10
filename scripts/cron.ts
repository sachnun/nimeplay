import { SQL } from 'bun'
import { BunRuntime } from '@effect/platform-bun'
import { Effect } from 'effect'
import { drizzle } from 'drizzle-orm/bun-sql'
import * as schema from '../server/database/schema'
import { setNodeDatabase } from '../server/utils/db'
import { runCatalog } from '../server/utils/jobs'
import { loadOfflineIndex } from '../server/utils/mal/offline'
import { enableProxy } from '../server/utils/media/proxy'
import { NetStatsService } from '../server/utils/net/stats'
import { AppLayer } from '../server/utils/runtime'

const POOL_MAX = 32

const client = new SQL({ url: process.env.NUXT_DATABASE_URL!, max: POOL_MAX })
setNodeDatabase(drizzle({ client, schema }))
enableProxy()

function closeClient(): void {
  void client.close().catch(() => {})
}

const program = Effect.gen(function* () {
  const stats = yield* NetStatsService
  const startedAt = Date.now()
  yield* Effect.logInfo('[run] start', { sha: process.env.GITHUB_SHA?.slice(0, 7) ?? 'local' })
  yield* Effect.tryPromise({
    try: () => loadOfflineIndex(),
    catch: error => error,
  }).pipe(Effect.catch(() => Effect.void))
  yield* Effect.tryPromise({
    try: () => runCatalog(),
    catch: error => (error instanceof Error ? error : new Error(String(error))),
  })
  yield* Effect.logInfo('[run] net', yield* stats.stats)
  yield* Effect.logInfo('[run] done', { ms: Date.now() - startedAt })
}).pipe(
  Effect.provide(AppLayer),
  Effect.tapError(error =>
    Effect.sync(() => {
      console.error('[run] fatal', error instanceof Error ? error.stack ?? error.message : String(error))
    }),
  ),
  Effect.ensuring(
    Effect.sync(() => {
      closeClient()
    }),
  ),
)

BunRuntime.runMain(program, { disableErrorReporting: true })

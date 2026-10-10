import { Context, Layer } from 'effect'
import type { Effect } from 'effect'
import { netStats, type NetStats } from './rate'

export class NetStatsService extends Context.Service<
  NetStatsService,
  {
    readonly stats: Effect.Effect<NetStats>
  }
>()('app/NetStats') {}

export const NetStatsLive = Layer.succeed(
  NetStatsService,
  NetStatsService.of({ stats: netStats() }),
)

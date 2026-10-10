import { Effect, Layer } from 'effect'
import type { Success } from 'effect/Layer'
import { AniList } from './mal/anilist'
import { LoggerLive } from './logger'
import { HttpLive } from './net/http'
import { NetStatsLive } from './net/stats'

export const AppLayer = Layer.mergeAll(AniList.live, NetStatsLive, LoggerLive, HttpLive)

export type AppServices = Success<typeof AppLayer>

export function runApp<A, E>(effect: Effect.Effect<A, E, AppServices>): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, AppLayer))
}

import { Layer } from 'effect'
import { AniList } from './mal/anilist'
import { LoggerLive } from './logger'
import { NetStatsLive } from './net/stats'

export const AppLayer = Layer.mergeAll(AniList.live, NetStatsLive, LoggerLive)

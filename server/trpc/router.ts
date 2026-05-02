import { t } from './init'
import { animeProcedures } from './procedures/anime'
import { playbackProcedures } from './procedures/playback'

export const appRouter = t.router({
  ...animeProcedures,
  ...playbackProcedures,
})

export type AppRouter = typeof appRouter

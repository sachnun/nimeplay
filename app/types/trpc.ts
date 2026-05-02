import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../server/trpc/router'

export type TrpcOutputs = inferRouterOutputs<AppRouter>

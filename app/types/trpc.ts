import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../server/trpc/router'

export type TrpcInputs = inferRouterInputs<AppRouter>
export type TrpcOutputs = inferRouterOutputs<AppRouter>

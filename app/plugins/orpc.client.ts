import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import { obfuscatedSerializer } from '#shared/rpc'
import type { AppRouter } from '~~/server/orpc/router'

export default defineNuxtPlugin(() => {
  const client = createORPCClient<RouterClient<AppRouter>>(
    new RPCLink({ url: '/api/rpc', serializer: obfuscatedSerializer }),
  )
  return { provide: { orpc: client } }
})

import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import type { AppRouter } from '~~/server/orpc/router'

export default defineNuxtPlugin(() => {
  const client = createORPCClient<RouterClient<AppRouter>>(
    new RPCLink({ url: `${useRequestURL().origin}/api/rpc` }),
  )
  return { provide: { orpc: client } }
})

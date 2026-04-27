import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '../../server/trpc/router'
import { TRPC_API_URL } from '~/utils/api'

export default defineNuxtPlugin(() => {
  const trpc = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: TRPC_API_URL,
      }),
    ],
  })

  return {
    provide: { trpc },
  }
})

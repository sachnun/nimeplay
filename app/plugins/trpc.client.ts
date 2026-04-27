import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '../../server/trpc/router'

export default defineNuxtPlugin(() => {
  const trpc = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: '/api/trpc',
      }),
    ],
  })

  return {
    provide: { trpc },
  }
})

import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '../../server/trpc/router'

export default defineNuxtPlugin(() => {
  const url = import.meta.server ? useRequestURL() : null
  const trpc = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: import.meta.server ? `${url!.origin}/api/trpc` : '/api/trpc',
      }),
    ],
  })

  return {
    provide: { trpc },
  }
})

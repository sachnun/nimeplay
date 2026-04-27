import { createTRPCClient, httpBatchLink, unstable_localLink } from '@trpc/client'
import type { AppRouter } from '../../server/trpc/router'
import { appRouter } from '../../server/trpc/router'

export default defineNuxtPlugin(() => {
  const trpc = createTRPCClient<AppRouter>({
    links: [
      import.meta.server
        ? unstable_localLink({
            router: appRouter,
            createContext: async () => ({}),
          })
        : httpBatchLink({
            url: '/api/trpc',
          }),
    ],
  })

  return {
    provide: { trpc },
  }
})

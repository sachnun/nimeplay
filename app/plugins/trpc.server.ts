import { createTRPCClient, unstable_localLink } from '@trpc/client'
import type { AppRouter } from '../../server/trpc/router'
import { appRouter } from '../../server/trpc/router'

export default defineNuxtPlugin(() => {
  const trpc = createTRPCClient<AppRouter>({
    links: [
      unstable_localLink({
        router: appRouter,
        createContext: async () => ({}),
      }),
    ],
  })

  return {
    provide: { trpc },
  }
})

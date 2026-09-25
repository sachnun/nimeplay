import { createRouterClient } from '@orpc/server'
import type { RouterClient } from '@orpc/server'
import { router } from '~~/server/orpc/router'
import type { AppRouter } from '~~/server/orpc/router'

export default defineNuxtPlugin(() => {
  const client: RouterClient<AppRouter> = createRouterClient(router, {
    context: { origin: useRequestURL().origin },
  })
  return { provide: { orpc: client } }
})

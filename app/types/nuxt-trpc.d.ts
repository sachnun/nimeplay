import type { TRPCClient } from '@trpc/client'
import type { AppRouter } from '../../server/trpc/router'

declare module '#app' {
  interface NuxtApp {
    $trpc: TRPCClient<AppRouter>
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $trpc: TRPCClient<AppRouter>
  }
}

export {}

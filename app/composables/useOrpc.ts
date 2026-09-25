import type { RouterClient } from '@orpc/server'
import type { AppRouter } from '~~/server/orpc/router'

export function useOrpc(): RouterClient<AppRouter> {
  return useNuxtApp().$orpc
}

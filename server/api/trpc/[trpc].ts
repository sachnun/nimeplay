import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '../../trpc/router'

export default defineEventHandler((event) => fetchRequestHandler({
  endpoint: '/api/trpc',
  req: toWebRequest(event),
  router: appRouter,
  createContext: () => ({}),
}))

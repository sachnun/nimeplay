import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '../../trpc/router'
import { apiCorsPreflightResponse, withApiCorsHeaders } from '../../utils/cors'

export default defineEventHandler(async (event) => {
  if (event.method === 'OPTIONS') return apiCorsPreflightResponse()

  return withApiCorsHeaders(await fetchRequestHandler({
    endpoint: '/api/trpc',
    req: toWebRequest(event),
    router: appRouter,
    createContext: () => ({}),
  }))
})

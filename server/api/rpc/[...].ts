import { RPCHandler } from '@orpc/server/fetch'
import { router } from '../../orpc/router'

const rpcHandler = new RPCHandler(router)

export default defineEventHandler(async (event) => {
  const { matched, response } = await rpcHandler.handle(toWebRequest(event), {
    prefix: '/api/rpc',
    context: { origin: getRequestURL(event).origin },
  })

  if (matched) return response

  setResponseStatus(event, 404)
  return 'Not found'
})

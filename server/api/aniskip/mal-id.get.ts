import { fetchMalId } from '../../utils/aniskip'
import { setApiCorsHeaders } from '../../utils/cors'

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  const title = String(getQuery(event).title || '').trim()
  return { malId: title ? await fetchMalId(title) : null }
})

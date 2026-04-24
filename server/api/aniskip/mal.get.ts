import { fetchMalId } from '../../utils/aniskip'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const title = String(query.title || '').trim()
  if (!title) return { malId: null }
  return { malId: await fetchMalId(title) }
})

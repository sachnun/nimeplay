import { getQuery } from 'h3'
import { listAnimePage } from '../utils/queries'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const type = String(query.type || 'ONGOING')
  const page = Math.max(1, Number(query.page) || 1)

  setHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')
  return type === 'COMPLETED' ? listAnimePage('COMPLETED', page, event) : listAnimePage('ONGOING', page, event)
})

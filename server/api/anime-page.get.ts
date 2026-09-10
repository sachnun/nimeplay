import { getQuery } from 'h3'
import { listAnimePage } from '../utils/queries'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const type = String(query.type || 'ONGOING')
  const page = Math.max(1, Number(query.page) || 1)

  setHeader(event, 'Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300')
  return type === 'COMPLETED' ? listAnimePage('COMPLETED', page) : listAnimePage('ONGOING', page)
})

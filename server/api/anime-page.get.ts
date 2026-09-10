import { getQuery } from 'h3'
import { listAnimePage } from '../utils/queries'
import { scheduleCatalogSync } from '../utils/refresh'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const type = String(query.type || 'ONGOING')
  const page = Math.max(1, Number(query.page) || 1)

  if (type === 'ONGOING' && page === 1) scheduleCatalogSync(event)

  return type === 'COMPLETED' ? listAnimePage('COMPLETED', page) : listAnimePage('ONGOING', page)
})

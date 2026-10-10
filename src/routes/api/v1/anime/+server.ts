import { json } from '@sveltejs/kit'
import { searchAnime } from '#lib/server/utils/db/queries/search'
import { listAnimePage } from '#lib/server/utils/db/queries/catalog'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').trim()
  if (q) {
    const rows = await searchAnime(q)
    return json({ data: rows, page: 1, totalPages: 1 })
  }

  const rawType = (url.searchParams.get('type') || 'ongoing').toUpperCase()
  const status = rawType === 'COMPLETED' ? 'COMPLETED' : 'ONGOING'
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)

  const result = await listAnimePage(status, page)
  return json({ data: result.anime, page, totalPages: result.totalPages })
}

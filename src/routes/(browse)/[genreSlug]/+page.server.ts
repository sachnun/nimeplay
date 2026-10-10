import { error } from '@sveltejs/kit'
import { getGenreAnimePage } from '#lib/server/utils/db/queries/genres'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params, parent }) => {
  const slug = (params.genreSlug || '').toLowerCase()
  const [result, { genres }] = await Promise.all([getGenreAnimePage(slug, 1), parent()])
  if (!result) error(404, 'Genre not found')
  const genre = genres.find(item => item.slug === slug)
  return { genreSlug: slug, genreName: genre?.name ?? slug, genrePage: result }
}

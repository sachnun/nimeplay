import { error } from '@sveltejs/kit'
import { query } from '$app/server'
import { genrePageSchema } from '#lib/schemas'
import { getGenreAnimePage, getGenreList } from '#lib/server/utils/db/queries/genres'

export const listGenres = query(async () => getGenreList())

export const listGenrePage = query(genrePageSchema, async ({ slug, page }) => {
  const result = await getGenreAnimePage(slug.toLowerCase(), page)
  if (!result) error(404, 'Genre not found')
  return result
})

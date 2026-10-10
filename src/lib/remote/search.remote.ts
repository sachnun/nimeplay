import { query } from '$app/server'
import { searchSchema } from '#lib/schemas'
import { searchAnime as searchAnimeQuery } from '#lib/server/utils/db/queries/search'

export const searchAnime = query(searchSchema, async value => searchAnimeQuery(value))

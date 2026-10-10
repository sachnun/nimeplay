import { query } from '$app/server'
import { animePageSchema } from '#lib/schemas'
import { listAnimePage } from '#lib/server/utils/db/queries/catalog'

export const listAnime = query(animePageSchema, async ({ status, page }) => listAnimePage(status, page))

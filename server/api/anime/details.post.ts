import { getLatestEpisodes } from '../../utils/queries'
import { db } from '../../utils/db'
import { anime } from '../../database/schema'
import { inArray } from 'drizzle-orm'

defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'Get details for multiple anime',
    description: 'Fetches lightweight anime info for a list of MyAnimeList IDs. Unknown or unsynced IDs return `anime: null`.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['malIds'],
            properties: {
              malIds: { type: 'array', items: { type: 'integer' }, description: 'MyAnimeList IDs' },
            },
          },
        },
      },
    },
    responses: {
      '200': { description: 'List of anime info keyed by MAL id' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const body = await readBody<{ malIds?: number[] }>(event)
  if (!body?.malIds?.length) return []

  const seen = new Set<number>()
  const ids = body.malIds
    .map(id => Number(id))
    .filter(id => Number.isInteger(id) && id > 0 && !seen.has(id) && seen.add(id))
    .slice(0, 50)

  if (ids.length === 0) return []

  const rows = await db()
    .select({ malId: anime.malId, title: anime.title, poster: anime.poster })
    .from(anime)
    .where(inArray(anime.malId, ids))
  const latest = await getLatestEpisodes(ids)

  return rows.map(row => ({
    malId: row.malId!,
    title: row.title,
    thumbnail: row.poster ?? '',
    latestEpisode: latest.get(row.malId!) ? String(latest.get(row.malId!)) : '',
    totalEpisode: latest.get(row.malId!) ? String(latest.get(row.malId!)) : '',
  }))
})

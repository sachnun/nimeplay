import { desc, eq, like } from 'drizzle-orm'
import { db } from '../../utils/db'
import { anime } from '../../database/schema'
import { fetchMalAnime, searchMalAnime } from '../../utils/mal'

defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'Get anime metadata (MyAnimeList)',
    description: 'Returns enriched metadata from MyAnimeList. Reads from the database first and falls back to a live MAL fetch for titles not yet synced. Requires either `malId` or `title`.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              japaneseTitle: { type: 'string' },
              malId: { type: 'integer', nullable: true },
              idOnly: { type: 'boolean', description: 'Only resolve the MAL id' },
            },
          },
        },
      },
    },
    responses: {
      '200': { description: 'MAL metadata or null when not found' },
    },
  },
})

const METADATA_TTL = 24 * 60 * 60 * 1000

interface MetadataRequestBody {
  title?: string
  japaneseTitle?: string
  malId?: number | null
  idOnly?: boolean
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function splitSeasonYear(season: string | null): { season: string | null, year: number | null } {
  if (!season) return { season: null, year: null }
  const [name, year] = season.split(' ')
  return { season: (name ?? null)?.toLowerCase() ?? null, year: year ? Number(year) : null }
}

async function lookupInDb(body: MetadataRequestBody) {
  const columns = {
    malId: anime.malId,
    synopsis: anime.synopsis,
    rating: anime.rating,
    rank: anime.rank,
    popularity: anime.popularity,
    season: anime.season,
    trailerId: anime.trailerId,
    characters: anime.characters,
  }

  if (body.malId) {
    const [row] = await db().select(columns).from(anime).where(eq(anime.malId, body.malId)).limit(1)
    if (row) return row
  }

  const title = body.title?.trim()
  if (!title) return null

  const [row] = await db()
    .select(columns)
    .from(anime)
    .where(like(anime.title, `%${title}%`))
    .orderBy(desc(anime.updatedAt))
    .limit(1)
  return row ?? null
}

export default defineEventHandler(async (event) => {
  const body = await readBody<MetadataRequestBody>(event)
  const title = body?.title?.trim() || ''
  const japaneseTitle = body?.japaneseTitle?.trim() || undefined
  const malId = body?.malId ?? null

  if (!malId && !title) return null

  const cacheKey = `${body?.idOnly ? 'i' : 'f'}:${malId ?? ''}:${japaneseTitle ?? ''}:${title}`
  return cache.metadata.get(cacheKey, METADATA_TTL, async () => {
    // Database first — metadata is synced from MyAnimeList by the scraper.
    const row = await lookupInDb({ ...body, title })
    if (row?.malId && (row.synopsis || (row.characters?.length ?? 0) > 0)) {
      if (body?.idOnly === true) return { malId: row.malId }
      const { season, year } = splitSeasonYear(row.season)
      const main = row.characters.filter(c => c.role === 'Main')
      const supporting = row.characters.filter(c => c.role !== 'Main')
      return {
        malId: row.malId,
        synopsisEn: stripHtml(row.synopsis ?? ''),
        background: '',
        malScore: row.rating !== null ? Number(row.rating) : null,
        malRank: row.rank,
        popularity: row.popularity,
        rating: '',
        season,
        year,
        trailerEmbedUrl: row.trailerId ? `https://www.youtube.com/embed/${row.trailerId}` : null,
        characters: [...main, ...supporting.slice(0, 10)],
      }
    }

    // Fallback: live MyAnimeList fetch for titles not yet synced.
    let resolvedMalId = malId ?? row?.malId ?? null
    if (!resolvedMalId) {
      resolvedMalId = await searchMalAnime(japaneseTitle || title)
        ?? (japaneseTitle && title ? await searchMalAnime(title) : null)
    }
    if (!resolvedMalId) return null

    const fetched = await fetchMalAnime(resolvedMalId)
    if (!fetched) return null

    if (body?.idOnly === true) return { malId: fetched.malId }

    const main = fetched.characters.filter(c => c.role === 'Main')
    const supporting = fetched.characters.filter(c => c.role !== 'Main')
    return {
      malId: fetched.malId,
      synopsisEn: stripHtml(fetched.synopsis),
      background: '',
      malScore: fetched.score,
      malRank: fetched.rank,
      popularity: fetched.popularity,
      rating: '',
      season: fetched.season,
      year: fetched.year,
      trailerEmbedUrl: fetched.trailerId ? `https://www.youtube.com/embed/${fetched.trailerId}` : null,
      characters: [...main, ...supporting.slice(0, 10)],
    }
  }) as Promise<unknown>
})

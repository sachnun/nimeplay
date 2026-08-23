defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'Get anime metadata (MyAnimeList)',
    description: 'Fetches enriched metadata from MyAnimeList (description, score, characters, trailer, etc). Requires either `malId` or `title`.',
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

export default defineEventHandler(async (event) => {
  const body = await readBody<MetadataRequestBody>(event)
  const title = body?.title?.trim() || ''
  const japaneseTitle = body?.japaneseTitle?.trim() || undefined
  const malId = body?.malId ?? null

  if (!malId && !title) return null

  const cacheKey = `${body?.idOnly ? 'i' : 'f'}:${malId ?? ''}:${japaneseTitle ?? ''}:${title}`
  return cache.metadata.get(cacheKey, METADATA_TTL, async () => {
    let resolvedMalId = malId
    if (!resolvedMalId) {
      resolvedMalId = await searchMalAnime(japaneseTitle || title)
        ?? (japaneseTitle && title ? await searchMalAnime(title) : null)
    }
    if (!resolvedMalId) return null

    const anime = await fetchMalAnime(resolvedMalId)
    if (!anime) return null

    if (body?.idOnly === true) return { malId: anime.malId }

    const main = anime.characters.filter(c => c.role === 'Main')
    const supporting = anime.characters.filter(c => c.role !== 'Main')
    return {
      malId: anime.malId,
      synopsisEn: stripHtml(anime.synopsis),
      background: '',
      malScore: anime.score,
      malRank: anime.rank,
      popularity: anime.popularity,
      rating: '',
      season: anime.season,
      year: anime.year,
      trailerEmbedUrl: anime.trailerId ? `https://www.youtube.com/embed/${anime.trailerId}` : null,
      characters: [...main, ...supporting.slice(0, 10)],
    }
  }) as Promise<unknown>
})

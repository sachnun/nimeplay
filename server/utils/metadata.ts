import { eq, sql } from 'drizzle-orm'
import { db } from './db'
import { toFtsQuery } from './fts'
import { anime } from '../database/schema'
import { fetchMalAnime, searchMalAnime, type MalCharacter } from './mal'
import { cleanSynopsis } from './synopsis'
import { getCharactersForAnime } from './queries'
import type { AnimeCharacter } from '#shared/types'

export interface MetadataRequestBody {
  title?: string
  japaneseTitle?: string
  malId?: number | null
  idOnly?: boolean
}

interface MetadataRecord {
  id: number
  slug: string
  malId: number | null
  synopsis: string | null
  rating: number | null
  rank: number | null
  popularity: number | null
  season: string | null
  year: number | null
  trailerId: string | null
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function lookupInDb(body: MetadataRequestBody): Promise<MetadataRecord | null> {
  const columns = {
    id: anime.id,
    slug: anime.slug,
    malId: anime.malId,
    synopsis: anime.synopsis,
    rating: anime.rating,
    rank: anime.rank,
    popularity: anime.popularity,
    season: anime.season,
    year: anime.year,
    trailerId: anime.trailerId,
  }

  if (body.malId) {
    const [row] = await db().select(columns).from(anime).where(eq(anime.malId, body.malId)).limit(1)
    if (row) return row
  }

  const title = body.title?.trim()
  if (!title) return null

  const [exact] = await db().select(columns).from(anime).where(eq(anime.title, title)).limit(1)
  if (exact) return exact

  const match = toFtsQuery(title)
  if (!match) return null
  const result = await db().execute(sql`
    select a.id as id, a.slug as slug, a.mal_id as "malId", a.synopsis as synopsis, a.rating as rating,
      a.rank as rank, a.popularity as popularity, a.season as season, a.year as year,
      a.trailer_id as "trailerId"
    from anime a
    where to_tsvector('simple', a.title) @@ to_tsquery('simple', ${match})
    order by ts_rank(to_tsvector('simple', a.title), to_tsquery('simple', ${match})) desc
    limit 1
  `)
  return (result.rows[0] as MetadataRecord | undefined) ?? null
}

function toMetadataPayload(source: {
  malId: number
  synopsis: string
  score: number | null
  rank: number | null
  popularity: number | null
  season: string | null
  year: number | null
  trailerId: string | null
  characters: (MalCharacter | AnimeCharacter)[]
}) {
  const main = source.characters.filter(c => c.role === 'Main')
  const supporting = source.characters.filter(c => c.role !== 'Main')
  return {
    malId: source.malId,
    synopsisEn: cleanSynopsis(stripHtml(source.synopsis)),
    background: '',
    malScore: source.score !== null ? Number(source.score) : null,
    malRank: source.rank,
    popularity: source.popularity,
    rating: '',
    season: source.season,
    year: source.year,
    trailerEmbedUrl: source.trailerId ? `https://www.youtube.com/embed/${source.trailerId}` : null,
    characters: [...main, ...supporting.slice(0, 10)],
  }
}

export async function resolveMetadata(body: MetadataRequestBody): Promise<unknown> {
  const title = body?.title?.trim() || ''
  const japaneseTitle = body?.japaneseTitle?.trim() || undefined
  const malId = body?.malId ?? null

  if (!malId && !title) return null

  const row = await lookupInDb({ ...body, title })
  if (row?.malId) {
    const chars = await getCharactersForAnime(row.id)
    if (row.synopsis || chars.length > 0) {
      if (body?.idOnly === true) return { malId: row.malId }
      return toMetadataPayload({
        malId: row.malId,
        synopsis: row.synopsis ?? '',
        score: row.rating,
        rank: row.rank,
        popularity: row.popularity,
        season: row.season,
        year: row.year,
        trailerId: row.trailerId,
        characters: chars,
      })
    }
  }

  let resolvedMalId = malId ?? row?.malId ?? null
  if (!resolvedMalId) {
    resolvedMalId = await searchMalAnime(japaneseTitle || title)
      ?? (japaneseTitle && title ? await searchMalAnime(title) : null)
  }
  if (!resolvedMalId) return null

  const fetched = await fetchMalAnime(resolvedMalId)
  if (!fetched) return null

  if (body?.idOnly === true) return { malId: fetched.malId }
  return toMetadataPayload({
    malId: fetched.malId,
    synopsis: fetched.synopsis,
    score: fetched.score,
    rank: fetched.rank,
    popularity: fetched.popularity,
    season: fetched.season,
    year: fetched.year,
    trailerId: fetched.trailerId,
    characters: fetched.characters,
  })
}

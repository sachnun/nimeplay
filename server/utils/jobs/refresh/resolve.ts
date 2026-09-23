import { fetchMalAnime, searchMalAnimeEntries } from '../../mal'
import { malSearchVariants, seasonNumber } from '../../mal/season'
import { rankMalAnimeMatches } from '../../mal/matching'
import type { MalAnime, MalSearchEntry } from '../../mal/types'
import type { AnimeSourceRow } from '../../../database/schema'
import type { AnimeSource, ScrapedAnimeDetail } from '../../sources/types'
import { linkSource, recordMetadataFailure, upsertCanonicalAnime } from './persist'

function parseOdYear(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.match(/(\d{4})/)
  if (!match) return null
  const year = Number(match[1])
  return year >= 1990 && year <= 2100 ? year : null
}

export async function resolveSourceMetadata(sourceRow: AnimeSourceRow, source: AnimeSource, detail: ScrapedAnimeDetail | null): Promise<number | null> {
  const slug = `${source.id}:${sourceRow.slug}`
  const title = (detail?.title || '').trim()
  if (!title) {
    await recordMetadataFailure(slug, 'no scraped title')
    return null
  }
  const merged = new Map<number, MalSearchEntry>()
  const search = async (variants: string[]): Promise<void> => {
    for (const variant of variants) {
      const batch = await searchMalAnimeEntries(variant)
      for (const entry of batch) {
        if (!merged.has(entry.id)) merged.set(entry.id, entry)
      }
      if (merged.size > 0) break
    }
  }
  await search(malSearchVariants(title))
  let ranked = rankMalAnimeMatches(title, [...merged.values()].slice(0, 15))
  const japanese = detail?.japanese
  if (ranked.length === 0 && japanese) {
    await search(malSearchVariants(japanese))
    ranked = rankMalAnimeMatches(title, [...merged.values()].slice(0, 15))
  }
  if (ranked.length === 0) {
    const top = [...merged.values()][0]?.title ?? '-'
    await recordMetadataFailure(slug, `no MAL title matches "${title}" (top: "${top}")`)
    return null
  }

  const detailYear = parseOdYear(detail?.releaseDate ?? null)
  let yearFallback: { mal: MalAnime, diff: number } | null = null

  for (const candidate of ranked.slice(0, 3)) {
    const mal = await fetchMalAnime(candidate.id)
    if (!mal) continue

    const siteSeason = seasonNumber(title)
    const candidateSeason = seasonNumber(candidate.title)
    if (siteSeason !== null && siteSeason > 1 && candidateSeason === null && mal.year !== null) {
      if (detailYear !== null && Math.abs(detailYear - mal.year) > 1) {
        if (!yearFallback || Math.abs(detailYear - mal.year) < yearFallback.diff) {
          yearFallback = { mal, diff: Math.abs(detailYear - mal.year) }
        }
        continue
      }
    }

    const animeId = await upsertCanonicalAnime(mal)
    await linkSource(sourceRow.id, animeId)
    return animeId
  }

  if (yearFallback) {
    const animeId = await upsertCanonicalAnime(yearFallback.mal)
    await linkSource(sourceRow.id, animeId)
    return animeId
  }

  await recordMetadataFailure(slug, `no usable MAL candidate for "${title}"`)
  return null
}

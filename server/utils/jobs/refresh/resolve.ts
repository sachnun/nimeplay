import { fetchMalAnime, searchMalAnimeEntries } from '../../mal'
import { malSearchVariants, seasonNumber } from '../../mal/season'
import { rankMalAnimeMatches } from '../../mal/matching'
import { offlineLookup } from '../../mal/offline'
import { log, ok } from '../../log'
import type { MalAnime, MalSearchEntry } from '../../mal/types'
import type { AnimeSourceRow } from '../../../database/schema'
import type { AnimeSource, ScrapedAnimeDetail } from '../../sources/types'
import { findAnimeIdByTitle, linkSource, recordMetadataFailure, upsertCanonicalAnime } from './persist'

function slugTitle(slug: string): string {
  return slug
    .replace(/-subtitle-indonesia$/i, '')
    .replace(/-sub-indo$/i, '')
    .replace(/-sub$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
}

function parseOdYear(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.match(/(\d{4})/)
  if (!match) return null
  const year = Number(match[1])
  return year >= 1990 && year <= 2100 ? year : null
}

export async function resolveSourceMetadata(sourceRow: AnimeSourceRow, source: AnimeSource, detail: ScrapedAnimeDetail | null): Promise<number | null> {
  const slug = `${source.id}:${sourceRow.slug}`
  const scraped = (detail?.title || '').trim()
  const title = scraped || slugTitle(sourceRow.slug)
  if (!title) {
    await recordMetadataFailure(slug, 'no scraped title')
    return null
  }
  if (!scraped) log(`[metadata] slug fallback ${slug}`, { title })

  const offline = await offlineLookup(title)
  if (offline && offline.score >= 0.9) {
    const mal = await fetchMalAnime(offline.malId)
    if (mal) {
      const animeId = await upsertCanonicalAnime(mal)
      await linkSource(sourceRow.id, animeId)
      ok(`[metadata] linked ${slug}`, { malId: mal.malId, title: mal.title, via: 'offline', score: Number(offline.score.toFixed(3)) })
      return animeId
    }
  }

  const existingAnimeId = await findAnimeIdByTitle(title)
  if (existingAnimeId) {
    await linkSource(sourceRow.id, existingAnimeId)
    ok(`[metadata] linked ${slug}`, { animeId: existingAnimeId, via: 'db' })
    return existingAnimeId
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
    log(`[metadata] miss ${slug}`, { title, candidates: merged.size, japanese: Boolean(japanese), top })
    await recordMetadataFailure(slug, `no MAL title matches "${title}" (top: "${top}")`)
    return null
  }
  const episodeCount = detail?.episodes.length ?? 0
  const candidates = ranked.filter(entry => !(entry.format === 'MOVIE' && episodeCount > 2))
  if (candidates.length === 0) {
    log(`[metadata] miss ${slug}`, { title, candidates: merged.size, episodes: episodeCount, top: ranked[0]?.title })
    await recordMetadataFailure(slug, `only movie candidates for ${episodeCount}-episode source "${title}"`)
    return null
  }
  log(`[metadata] match ${slug}`, { title, candidates: merged.size, ranked: ranked.length, top: candidates[0]?.title })

  const detailYear = parseOdYear(detail?.releaseDate ?? null)
  let yearFallback: { mal: MalAnime, diff: number } | null = null

  for (const candidate of candidates.slice(0, 3)) {
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
    ok(`[metadata] linked ${slug}`, { malId: mal.malId, title: mal.title })
    return animeId
  }

  if (yearFallback) {
    const animeId = await upsertCanonicalAnime(yearFallback.mal)
    await linkSource(sourceRow.id, animeId)
    ok(`[metadata] linked ${slug}`, { malId: yearFallback.mal.malId, title: yearFallback.mal.title, via: 'year' })
    return animeId
  }

  await recordMetadataFailure(slug, `no usable MAL candidate for "${title}"`)
  return null
}

import type { AnimeSourceRow } from '../../../database/schema'
import { log, ok } from '../../log'
import { fetchMalAnime, searchMalAnimeEntries } from '../../mal'
import { rankMalAnimeMatches } from '../../mal/matching'
import { offlineLookup } from '../../mal/offline'
import { malSearchVariants, seasonNumber } from '../../mal/season'
import type { MalAnime, MalSearchEntry } from '../../mal/types'
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

async function linkViaOffline(sourceRow: AnimeSourceRow, slug: string, title: string): Promise<number | null> {
  const offline = await offlineLookup(title)
  if (!offline || offline.score < 0.9) return null
  const mal = await fetchMalAnime(offline.malId)
  if (!mal) return null
  const animeId = await upsertCanonicalAnime(mal)
  await linkSource(sourceRow.id, animeId)
  ok(`[metadata] linked ${slug}`, {
    malId: mal.malId,
    title: mal.title,
    via: 'offline',
    score: Number(offline.score.toFixed(3)),
  })
  return animeId
}

async function collectMatches(title: string, japanese: string | undefined): Promise<MalSearchEntry[]> {
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
  if (ranked.length === 0 && japanese) {
    await search(malSearchVariants(japanese))
    ranked = rankMalAnimeMatches(title, [...merged.values()].slice(0, 15))
  }
  return ranked
}

function seasonMismatch(
  title: string,
  candidateTitle: string,
  detailYear: number | null,
  malYear: number | null,
): number | null {
  const siteSeason = seasonNumber(title)
  const candidateSeason = seasonNumber(candidateTitle)
  if (siteSeason === null || siteSeason <= 1 || candidateSeason !== null || malYear === null) return null
  if (detailYear === null || Math.abs(detailYear - malYear) <= 1) return null
  return Math.abs(detailYear - malYear)
}

async function linkBestCandidate(
  sourceRow: AnimeSourceRow,
  slug: string,
  candidates: MalSearchEntry[],
  detailYear: number | null,
  title: string,
): Promise<number | null> {
  let yearFallback: { mal: MalAnime; diff: number } | null = null
  for (const candidate of candidates.slice(0, 3)) {
    const mal = await fetchMalAnime(candidate.id)
    if (!mal) continue
    const diff = seasonMismatch(title, candidate.title, detailYear, mal.year)
    if (diff !== null) {
      if (!yearFallback || diff < yearFallback.diff) yearFallback = { mal, diff }
      continue
    }
    const animeId = await upsertCanonicalAnime(mal)
    await linkSource(sourceRow.id, animeId)
    ok(`[metadata] linked ${slug}`, { malId: mal.malId, title: mal.title })
    return animeId
  }
  if (!yearFallback) return null
  const animeId = await upsertCanonicalAnime(yearFallback.mal)
  await linkSource(sourceRow.id, animeId)
  ok(`[metadata] linked ${slug}`, { malId: yearFallback.mal.malId, title: yearFallback.mal.title, via: 'year' })
  return animeId
}

export async function resolveSourceMetadata(
  sourceRow: AnimeSourceRow,
  source: AnimeSource,
  detail: ScrapedAnimeDetail | null,
): Promise<number | null> {
  const slug = `${source.id}:${sourceRow.slug}`
  const scraped = (detail?.title || '').trim()
  const title = scraped || slugTitle(sourceRow.slug)
  if (!title) {
    await recordMetadataFailure(slug, 'no scraped title')
    return null
  }
  if (!scraped) log(`[metadata] slug fallback ${slug}`, { title })

  const offlineId = await linkViaOffline(sourceRow, slug, title)
  if (offlineId) return offlineId

  const existingAnimeId = await findAnimeIdByTitle(title)
  if (existingAnimeId) {
    await linkSource(sourceRow.id, existingAnimeId)
    ok(`[metadata] linked ${slug}`, { animeId: existingAnimeId, via: 'db' })
    return existingAnimeId
  }

  const japanese = detail?.japanese
  const ranked = await collectMatches(title, japanese)
  if (ranked.length === 0) {
    log(`[metadata] miss ${slug}`, { title, japanese: Boolean(japanese) })
    await recordMetadataFailure(slug, `no MAL title matches "${title}"`)
    return null
  }

  const episodeCount = detail?.episodes.length ?? 0
  const candidates = ranked.filter(entry => !(entry.format === 'MOVIE' && episodeCount > 2))
  if (candidates.length === 0) {
    log(`[metadata] miss ${slug}`, { title, episodes: episodeCount, top: ranked[0]?.title })
    await recordMetadataFailure(slug, `only movie candidates for ${episodeCount}-episode source "${title}"`)
    return null
  }
  log(`[metadata] match ${slug}`, { title, ranked: ranked.length, top: candidates[0]?.title })

  const animeId = await linkBestCandidate(sourceRow, slug, candidates, parseOdYear(detail?.releaseDate ?? null), title)
  if (animeId) return animeId

  await recordMetadataFailure(slug, `no usable MAL candidate for "${title}"`)
  return null
}

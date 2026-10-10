import { Effect } from 'effect'
import type { AnimeSourceRow } from '../../../database/schema'
import { log, ok } from '../../log'
import { fetchMalAnimeEffect, searchMalAnimeEntriesEffect } from '../../mal'
import type { AniList } from '../../mal/anilist'
import { rankMalAnimeMatches } from '../../mal/matching'
import { malSearchVariants, seasonNumber } from '../../mal/season'
import { normalizeSlugTitle } from '../../mal/slug'
import type { MalAnime, MalSearchEntry } from '../../mal/types'
import type { AnimeSource, ScrapedAnimeDetail } from '../../sources/types'
import { findAnimeIdByTitle, linkSource, recordMetadataFailure, upsertCanonicalAnime } from './persist'

function slugTitle(slug: string): string {
  return normalizeSlugTitle(slug)
}

function parseOdYear(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.match(/(\d{4})/)
  if (!match) return null
  const year = Number(match[1])
  return year >= 1990 && year <= 2100 ? year : null
}

function collectMatches(
  title: string,
  japanese: string | undefined,
): Effect.Effect<MalSearchEntry[], never, AniList> {
  return Effect.gen(function* () {
    const merged = new Map<number, MalSearchEntry>()
    const search = (variants: string[]): Effect.Effect<void, never, AniList> =>
      Effect.gen(function* () {
        for (const variant of variants) {
          const batch = yield* searchMalAnimeEntriesEffect(variant)
          for (const entry of batch) {
            if (!merged.has(entry.id)) merged.set(entry.id, entry)
          }
          if (merged.size > 0) break
        }
      })
    yield* search(malSearchVariants(title))
    let ranked = rankMalAnimeMatches(title, [...merged.values()].slice(0, 15))
    if (ranked.length === 0 && japanese) {
      yield* search(malSearchVariants(japanese))
      ranked = rankMalAnimeMatches(title, [...merged.values()].slice(0, 15))
    }
    return ranked
  })
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

function linkBestCandidate(
  sourceRow: AnimeSourceRow,
  slug: string,
  candidates: MalSearchEntry[],
  detailYear: number | null,
  title: string,
): Effect.Effect<number | null, never, AniList> {
  return Effect.gen(function* () {
    let yearFallback: { mal: MalAnime; diff: number } | null = null
    for (const candidate of candidates.slice(0, 3)) {
      const mal = yield* fetchMalAnimeEffect(candidate.id, candidate.title)
      if (!mal) continue
      const diff = seasonMismatch(title, candidate.title, detailYear, mal.year)
      if (diff !== null) {
        if (!yearFallback || diff < yearFallback.diff) yearFallback = { mal, diff }
        continue
      }
      const animeId = yield* Effect.promise(() => upsertCanonicalAnime(mal))
      yield* Effect.promise(() => linkSource(sourceRow.id, animeId))
      yield* Effect.sync(() => ok(`[metadata] linked ${slug}`, { malId: mal.malId, title: mal.title }))
      return animeId
    }
    if (!yearFallback) return null
    const fallback = yearFallback
    const animeId = yield* Effect.promise(() => upsertCanonicalAnime(fallback.mal))
    yield* Effect.promise(() => linkSource(sourceRow.id, animeId))
    yield* Effect.sync(() =>
      ok(`[metadata] linked ${slug}`, { malId: fallback.mal.malId, title: fallback.mal.title, via: 'year' }),
    )
    return animeId
  })
}

export function resolveSourceMetadata(
  sourceRow: AnimeSourceRow,
  source: AnimeSource,
  detail: ScrapedAnimeDetail | null,
): Effect.Effect<number | null, never, AniList> {
  return Effect.gen(function* () {
    const slug = `${source.id}:${sourceRow.slug}`
    const scraped = (detail?.title || '').trim()
    const title = scraped || slugTitle(sourceRow.slug)
    if (!title) {
      yield* Effect.promise(() => recordMetadataFailure(sourceRow.id, slug, 'no scraped title'))
      return null
    }
    if (!scraped) yield* Effect.sync(() => log(`[metadata] slug fallback ${slug}`, { title }))

    const existingAnimeId = yield* Effect.promise(() => findAnimeIdByTitle(title))
    if (existingAnimeId) {
      yield* Effect.promise(() => linkSource(sourceRow.id, existingAnimeId))
      yield* Effect.sync(() => ok(`[metadata] linked ${slug}`, { animeId: existingAnimeId, via: 'db' }))
      return existingAnimeId
    }

    const japanese = detail?.japanese
    const ranked = yield* collectMatches(title, japanese)
    if (ranked.length === 0) {
      yield* Effect.sync(() => log(`[metadata] miss ${slug}`, { title, japanese: Boolean(japanese) }))
      yield* Effect.promise(() => recordMetadataFailure(sourceRow.id, slug, `no MAL title matches "${title}"`))
      return null
    }

    const episodeCount = detail?.episodes.length ?? 0
    const candidates = ranked.filter(entry => !(entry.format === 'MOVIE' && episodeCount > 2))
    if (candidates.length === 0) {
      yield* Effect.sync(() =>
        log(`[metadata] miss ${slug}`, { title, episodes: episodeCount, top: ranked[0]?.title }),
      )
      yield* Effect.promise(() =>
        recordMetadataFailure(sourceRow.id, slug, `only movie candidates for ${episodeCount}-episode source "${title}"`),
      )
      return null
    }
    yield* Effect.sync(() =>
      log(`[metadata] match ${slug}`, { title, ranked: ranked.length, top: candidates[0]?.title }),
    )

    const animeId = yield* linkBestCandidate(
      sourceRow,
      slug,
      candidates,
      parseOdYear(detail?.releaseDate ?? null),
      title,
    )
    if (animeId) return animeId

    yield* Effect.promise(() => recordMetadataFailure(sourceRow.id, slug, `no usable MAL candidate for "${title}"`))
    return null
  })
}

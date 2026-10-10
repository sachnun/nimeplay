import { Cache, Duration, Effect } from 'effect'
import { titleSimilarity } from './fuzzy'
import { seasonNumber } from './season'
import {
  baseTitle,
  bracketVariants,
  cleanTitle,
  isMovieTitle,
  isSpinoffTitle,
  movieSeasonClash,
  normalizeTitleKey,
  tokenizeTitle,
} from './title'

const DATASET_URL =
  'https://github.com/manami-project/anime-offline-database/releases/latest/download/anime-offline-database-minified.json'
const MIN_SCORE = 0.86
const MIN_MARGIN = 0.03
const NON_SERIES_TYPES = new Set(['OVA', 'ONA', 'SPECIAL', 'MUSIC'])
const NON_SERIES_PATTERN = /\b(ova|ona|special|music)\b/i
const LOOKUP_TTL = Duration.hours(6)
const LOOKUP_CAPACITY = 50_000

interface OfflineEntry {
  malId: number
  title: string
  type: string
  titles: string[]
}

interface OfflineIndex {
  exact: Map<string, number[]>
  postings: Map<string, number[]>
  entries: OfflineEntry[]
}

interface OfflineMatch {
  malId: number
  title: string
  score: number
}

let indexPromise: Promise<OfflineIndex | null> | null = null

function malIdFromSources(sources: string[]): number | null {
  const match = sources.map(source => source.match(/myanimelist\.net\/anime\/(\d+)/)?.[1]).find(Boolean)
  return match ? Number(match) : null
}

function indexTitles(
  exact: Map<string, number[]>,
  postings: Map<string, number[]>,
  titles: string[],
  entryIndex: number,
): void {
  for (const title of titles) {
    const key = normalizeTitleKey(title)
    if (!key) continue
    const list = exact.get(key)
    if (list) list.push(entryIndex)
    else exact.set(key, [entryIndex])
    for (const token of new Set(tokenizeTitle(title))) {
      const posting = postings.get(token)
      if (posting) posting.push(entryIndex)
      else postings.set(token, [entryIndex])
    }
  }
}

async function buildIndex(): Promise<OfflineIndex | null> {
  try {
    const res = await fetch(DATASET_URL, { signal: AbortSignal.timeout(180000) })
    if (!res.ok) return null
    const dataset = JSON.parse(await res.text()) as {
      data?: { title?: string; type?: string; synonyms?: string[]; sources?: string[] }[]
    }
    const entries: OfflineEntry[] = []
    const exact = new Map<string, number[]>()
    const postings = new Map<string, number[]>()
    for (const item of dataset.data ?? []) {
      const malId = malIdFromSources(item.sources ?? [])
      if (!malId || !item.title) continue
      const titles = [item.title, ...(item.synonyms ?? [])].filter(Boolean) as string[]
      const entryIndex = entries.length
      entries.push({ malId, title: item.title, type: (item.type ?? '').toUpperCase(), titles })
      indexTitles(exact, postings, titles, entryIndex)
    }
    return { exact, postings, entries }
  } catch {
    return null
  }
}

export function loadOfflineIndex(): Promise<OfflineIndex | null> {
  if (!indexPromise) indexPromise = buildIndex()
  return indexPromise
}

function seasonsCompatible(querySeason: number | null, candidateSeason: number | null): boolean {
  if (querySeason !== null && candidateSeason !== null) return querySeason === candidateSeason
  if (querySeason === null) return !(candidateSeason !== null && candidateSeason > 1)
  return !(querySeason > 1 && candidateSeason === null)
}

function similarityFor(query: string, candidate: string, querySeason: number | null): number {
  const score = titleSimilarity(query, cleanTitle(candidate))
  if (querySeason === null || querySeason === 1) {
    return Math.max(score, titleSimilarity(baseTitle(query), baseTitle(candidate)))
  }
  return score
}

function scoreEntry(entry: OfflineEntry, queries: string[]): number {
  let score = 0
  for (const candidateQuery of queries) {
    if (isSpinoffTitle(entry.title, candidateQuery)) continue
    const querySeason = seasonNumber(candidateQuery)
    for (const candidate of entry.titles) {
      if (isSpinoffTitle(candidate, candidateQuery)) continue
      if (!seasonsCompatible(querySeason, seasonNumber(candidate))) continue
      score = Math.max(score, similarityFor(candidateQuery, candidate, querySeason))
    }
  }
  return score
}

function collectCandidates(index: OfflineIndex, queries: string[]): { exact: Set<number>; candidates: Set<number> } {
  const exact = new Set<number>()
  const candidates = new Set<number>()
  for (const candidateQuery of queries) {
    for (const entryIndex of index.exact.get(normalizeTitleKey(candidateQuery)) ?? []) {
      exact.add(entryIndex)
      candidates.add(entryIndex)
    }
    for (const token of new Set(tokenizeTitle(candidateQuery))) {
      for (const entryIndex of index.postings.get(token) ?? []) candidates.add(entryIndex)
    }
  }
  return { exact, candidates }
}

function typePenalty(entry: OfflineEntry, title: string): number {
  if (entry.type === 'MOVIE' && !isMovieTitle(title)) return 0.05
  if (NON_SERIES_TYPES.has(entry.type) && !NON_SERIES_PATTERN.test(title)) return 0.15
  return 0
}

function bestMatch(
  index: OfflineIndex,
  title: string,
  queries: string[],
  candidates: Set<number>,
): { entryIndex: number; score: number; second: number } | null {
  let best: { entryIndex: number; score: number } | null = null
  let second = 0
  for (const entryIndex of candidates) {
    const entry = index.entries[entryIndex]!
    if (movieSeasonClash(title, entry.title)) continue
    const score = scoreEntry(entry, queries) - typePenalty(entry, title)
    if (score <= 0) continue
    if (!best || score > best.score) {
      second = best?.score ?? 0
      best = { entryIndex, score }
    } else if (score > second) {
      second = score
    }
  }
  return best ? { entryIndex: best.entryIndex, score: best.score, second } : null
}

function lookup(index: OfflineIndex, query: string): OfflineMatch | null {
  const title = query.trim()
  if (!title) return null

  const queries = bracketVariants(title)
  const { exact, candidates } = collectCandidates(index, queries)
  if (exact.size === 1) {
    const entry = index.entries[[...exact][0]!]!
    if (!movieSeasonClash(title, entry.title)) return { malId: entry.malId, title: entry.title, score: 1 }
  }

  const best = bestMatch(index, title, queries, candidates)
  if (!best || best.score < MIN_SCORE || best.score - best.second < MIN_MARGIN) return null
  const entry = index.entries[best.entryIndex]!
  return { malId: entry.malId, title: entry.title, score: best.score }
}

const lookupCache = Effect.runSync(
  Cache.make<string, OfflineMatch | null>({
    capacity: LOOKUP_CAPACITY,
    lookup: title =>
      Effect.promise(async () => {
        const index = await loadOfflineIndex()
        return index ? lookup(index, title) : null
      }),
    timeToLive: LOOKUP_TTL,
  }),
)

export function offlineLookup(query: string): Promise<OfflineMatch | null> {
  const title = query.trim()
  if (!title) return Promise.resolve(null)
  return Effect.runPromise(Cache.get(lookupCache, title))
}

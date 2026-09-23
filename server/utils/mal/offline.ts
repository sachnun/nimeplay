import { titleSimilarity } from './fuzzy'
import { seasonNumber } from './season'
import { baseTitle, bracketVariants, cleanTitle, isSpinoffTitle, normalizeTitleKey, tokenizeTitle } from './title'

const DATASET_URL = 'https://github.com/manami-project/anime-offline-database/releases/latest/download/anime-offline-database-minified.json'
const MIN_SCORE = 0.86
const MIN_MARGIN = 0.03

interface OfflineEntry {
  malId: number
  title: string
  type: string
  titles: string[]
}

interface OfflineIndex {
  exact: Map<string, number>
  postings: Map<string, number[]>
  entries: OfflineEntry[]
}

export interface OfflineMatch {
  malId: number
  title: string
  score: number
}

let loading: Promise<OfflineIndex | null> | null = null

async function buildIndex(): Promise<OfflineIndex | null> {
  try {
    const res = await fetch(DATASET_URL, { signal: AbortSignal.timeout(180000) })
    if (!res.ok) return null
    const dataset = JSON.parse(await res.text()) as { data?: { title?: string, type?: string, synonyms?: string[], sources?: string[] }[] }
    const entries: OfflineEntry[] = []
    const exact = new Map<string, number>()
    const postings = new Map<string, number[]>()
    for (const item of dataset.data ?? []) {
      const malId = (item.sources ?? []).map(source => source.match(/myanimelist\.net\/anime\/(\d+)/)?.[1]).find(Boolean)
      if (!malId || !item.title) continue
      const titles = [item.title, ...(item.synonyms ?? [])].filter(Boolean) as string[]
      const index = entries.length
      entries.push({ malId: Number(malId), title: item.title, type: (item.type ?? '').toUpperCase(), titles })
      for (const title of titles) {
        const key = normalizeTitleKey(title)
        if (key && !exact.has(key)) exact.set(key, index)
        for (const token of new Set(tokenizeTitle(title))) {
          const list = postings.get(token)
          if (list) list.push(index)
          else postings.set(token, [index])
        }
      }
    }
    return { exact, postings, entries }
  }
  catch {
    return null
  }
}

export function loadOfflineIndex(): Promise<OfflineIndex | null> {
  if (!loading) loading = buildIndex()
  return loading
}

export async function offlineLookup(query: string): Promise<OfflineMatch | null> {
  const title = query.trim()
  if (!title) return null
  const index = await loadOfflineIndex()
  if (!index) return null
  const queries = bracketVariants(title)
  for (const candidateQuery of queries) {
    const exactIndex = index.exact.get(normalizeTitleKey(candidateQuery))
    if (exactIndex !== undefined) {
      const entry = index.entries[exactIndex]!
      return { malId: entry.malId, title: entry.title, score: 1 }
    }
  }
  const counts = new Map<number, number>()
  for (const candidateQuery of queries) {
    for (const token of new Set(tokenizeTitle(candidateQuery))) {
      for (const entryIndex of index.postings.get(token) ?? []) counts.set(entryIndex, (counts.get(entryIndex) ?? 0) + 1)
    }
  }
  let best: { entryIndex: number, score: number } | null = null
  let second = 0
  for (const [entryIndex] of counts) {
    const entry = index.entries[entryIndex]!
    let score = 0
    for (const candidateQuery of queries) {
      if (isSpinoffTitle(entry.title, candidateQuery)) continue
      const querySeason = seasonNumber(candidateQuery)
      for (const candidate of entry.titles) {
        if (isSpinoffTitle(candidate, candidateQuery)) continue
        const candidateSeason = seasonNumber(candidate)
        if (querySeason !== null && candidateSeason !== null && querySeason !== candidateSeason) continue
        if (querySeason === null && candidateSeason !== null && candidateSeason > 1) continue
        if (querySeason !== null && querySeason > 1 && candidateSeason === null) continue
        score = Math.max(score, titleSimilarity(candidateQuery, cleanTitle(candidate)))
        if (querySeason === null || querySeason === 1) score = Math.max(score, titleSimilarity(baseTitle(candidateQuery), baseTitle(candidate)))
      }
    }
    if (score === 0) continue
    if (entry.type === 'MOVIE' && !/\bmovie\b/i.test(title)) score -= 0.05
    else if ((entry.type === 'OVA' || entry.type === 'ONA' || entry.type === 'SPECIAL' || entry.type === 'MUSIC') && !/\b(ova|ona|special|music)\b/i.test(title)) score -= 0.15
    if (score <= 0) continue
    if (!best || score > best.score) {
      second = best?.score ?? 0
      best = { entryIndex, score }
    }
    else if (score > second) {
      second = score
    }
  }
  if (!best || best.score < MIN_SCORE || best.score - second < MIN_MARGIN) return null
  const entry = index.entries[best.entryIndex]!
  return { malId: entry.malId, title: entry.title, score: best.score }
}

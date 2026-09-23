import { seasonNumber } from './season'
import type { JikanTitle } from './anilist'
import type { MalSearchEntry } from './types'

export function decodeEntities(value: string): string {
  return value
    .replace(/&#0?39;|&apos;/g, '\'')
    .replace(/&quot;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .trim()
}

export function stripHtml(value: string): string {
  return value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
}

export function titleOf(title: JikanTitle): string {
  return decodeEntities(title.english || title.romaji || title.native || '')
}

export function matchTitleOf(title: JikanTitle): string {
  return decodeEntities(title.romaji || title.english || title.native || '')
}

export function titlesOf(title: JikanTitle): string[] {
  const values = [title.english, title.romaji, title.native]
    .map(value => decodeEntities(value ?? '').trim())
    .filter(Boolean)
  return [...new Set(values)]
}

export function sourceLabel(value: string | null | undefined): string | null {
  if (!value) return null
  const lower = value.toLowerCase().replace(/_/g, ' ')
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

const TITLE_STOPWORDS = new Set(['the', 'and', 'for', 'episode', 'movie', 'special', 'ova', 'end'])

function titleWords(value: string): Set<string> {
  return new Set(
    value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(word => word.length >= 3 && !TITLE_STOPWORDS.has(word)),
  )
}

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]!
}

function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 1
  return 1 - levenshtein(a, b) / longest
}

function isTitlePrefix(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= 8 && short.length / long.length >= 0.25 && long.startsWith(short)
}

function phoneticNormalize(value: string): string {
  return value.toLowerCase().split('ou').join('o').split('oo').join('o').split('skirt').join('suka').split('ph').join('f').split('dungeon').join('danjon')
}

function matchWords(value: string): string[] {
  return phoneticNormalize(value).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(word => word.length >= 2 && !TITLE_STOPWORDS.has(word))
}

function tokenJaccard(siteTitle: string, malTitle: string): number {
  const siteTokens = matchWords(siteTitle)
  const malSet = new Set(matchWords(malTitle))
  if (siteTokens.length === 0 || malSet.size === 0) return 0
  const seen = new Set<string>()
  let inter = 0
  for (const token of siteTokens) {
    if (!seen.has(token) && malSet.has(token)) {
      inter++
      seen.add(token)
    }
  }
  return inter / Math.max(siteTokens.length, malSet.size)
}

function isAbbrevOnBase(siteBase: string, malBase: string): boolean {
  const site = normalizeTitle(phoneticNormalize(siteBase))
  const words = matchWords(malBase).map(word => normalizeTitle(phoneticNormalize(word))).filter(word => word.length >= 2)
  if (site.length < 3 || site.length > 24 || words.length === 0) return false
  function walk(pos: number, used: number): boolean {
    if (pos === site.length) return used >= 1
    if (used > 5) return false
    for (const word of words) {
      const maxTake = Math.min(word.length, site.length - pos)
      for (let take = maxTake; take >= 2; take--) {
        const chunk = site.slice(pos, pos + take)
        const head = word.slice(0, take)
        if (word.startsWith(chunk) || similarity(head, chunk) >= 0.75) {
          if (walk(pos + take, used + 1)) return true
        }
      }
    }
    return false
  }
  return walk(0, 0)
}

export function stripSeasonMarker(title: string): string {
  return title
    .replace(/\s*:\s*sono\s+\w+\s*$/i, '')
    .replace(/\s*:\s*\w+\s+no\s+(shou|hen|ki|maku)\b.*$/i, '')
    .replace(/\s+(season\s*\d+|\d+\s*(st|nd|rd|th)?\s*season|S\d+)\s*$/i, '')
    .replace(/\s+part\s*\d+\s*$/i, '')
    .replace(/\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(\s+season)?\s*$/i, '')
    .replace(/\s+(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\s*$/i, '')
    .replace(/\s+\d{1,2}\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function baseScore(siteBase: string, malBase: string): number {
  const siteNorm = normalizeTitle(siteBase)
  const malNorm = normalizeTitle(malBase)
  if (!siteNorm || !malNorm) return 0
  if (siteNorm === malNorm) return 1.5
  const sim = similarity(siteNorm, malNorm)
  const siteTokens = matchWords(siteBase)
  const malSet = new Set(matchWords(malBase))
  let inter = 0
  for (const token of siteTokens) {
    if (malSet.has(token)) inter++
  }
  const jac = inter / Math.max(1, Math.max(siteTokens.length, malSet.size))
  let score = sim * 0.7 + jac * 0.8
  if (isAbbrevOnBase(siteBase, malBase)) score += 0.6
  if (sim >= 0.8) score += 0.3
  return score
}

const SPINOFF_STRONG = ['petit', 'chibi', 'mini anime', 'minianime', 'picture drama', 'soumatou', 'recap', 'bonus stage', 'additional time', 'gift', 'pilot', 'collage', 'specials', 'junjou', 'buddy go']
const SPINOFF_SOFT = ['movie', 'ova', 'ona', 'special', 'short anime', 'ova series']

function hasSpinoffMark(siteTitle: string, malTitle: string): boolean {
  const site = siteTitle.toLowerCase()
  const mal = malTitle.toLowerCase()
  return SPINOFF_STRONG.some(hint => mal.includes(hint) && !site.includes(hint))
}

function hasSpinoffPenalty(siteTitle: string, malTitle: string): boolean {
  const site = siteTitle.toLowerCase()
  const mal = malTitle.toLowerCase()
  return [...SPINOFF_STRONG, ...SPINOFF_SOFT].some(hint => mal.includes(hint) && !site.includes(hint))
}

export function titlesMatch(siteTitle: string, malTitle: string): boolean {
  if (hasSpinoffMark(siteTitle, malTitle)) return false
  const siteNorm = normalizeTitle(siteTitle)
  const malNorm = normalizeTitle(malTitle)
  if (siteNorm === malNorm) return true
  const siteSeason = seasonNumber(siteTitle)
  const malSeason = seasonNumber(malTitle)
  if (siteSeason !== null && malSeason !== null && siteSeason !== malSeason) return false
  if (similarity(siteNorm, malNorm) >= 0.8) return true
  if (isTitlePrefix(siteNorm, malNorm) && !(siteSeason !== null && siteSeason > 1 && malSeason === null)) return true
  const siteBase = stripSeasonMarker(siteTitle)
  const malBase = stripSeasonMarker(malTitle)
  const score = baseScore(siteBase, malBase)
  const baseAligned = normalizeTitle(siteBase) === normalizeTitle(malBase)
    || similarity(normalizeTitle(siteBase), normalizeTitle(malBase)) >= 0.6
    || tokenJaccard(siteBase, malBase) >= 0.5
    || isAbbrevOnBase(siteBase, malBase)
  let adjusted = score
  if (baseAligned && siteSeason !== null && malSeason !== null && siteSeason === malSeason) adjusted += 0.6
  if (siteSeason !== null && siteSeason > 1 && malSeason === null) adjusted -= 0.5
  if (siteSeason === null && malSeason !== null && malSeason > 1) return false
  if (adjusted >= 0.75) return true
  if (tokenJaccard(siteBase, malBase) >= 0.5 && adjusted >= 0.55) return true
  return isAbbrevOnBase(siteBase, malBase) && adjusted >= 0.4
}

function matchScore(siteTitle: string, malTitle: string): number {
  const siteNorm = normalizeTitle(siteTitle)
  const malNorm = normalizeTitle(malTitle)
  const siteSeason = seasonNumber(siteTitle)
  const malSeason = seasonNumber(malTitle)
  let score = similarity(siteNorm, malNorm)
  if (siteNorm === malNorm) score += 1
  score += tokenJaccard(stripSeasonMarker(siteTitle), stripSeasonMarker(malTitle)) * 0.5
  score -= Math.max(0, malNorm.length - siteNorm.length) / 150
  if (siteSeason !== null && malSeason !== null && siteSeason === malSeason) score += 0.6
  if (siteSeason !== null && siteSeason > 1 && malSeason === null) score -= 0.3
  if (hasSpinoffPenalty(siteTitle, malTitle)) score -= 0.4
  return score
}

const MARKER_WORDS = new Set([
  'season', 'part', 'first', 'second', 'third', 'fourth', 'fifth',
  'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'xi', 'xii',
])

function isMarkerWord(word: string): boolean {
  return MARKER_WORDS.has(word) || /^\d+(?:st|nd|rd|th)?$/.test(word)
}

function contentOverlap(siteTitle: string, malTitle: string): number {
  const siteWords = [...titleWords(siteTitle)].filter(word => !isMarkerWord(word))
  const malWords = new Set([...titleWords(malTitle)].filter(word => !isMarkerWord(word)))
  return siteWords.filter(word => malWords.has(word)).length
}

const SPINOFF_FORMATS = new Set(['OVA', 'ONA', 'SPECIAL', 'MUSIC', 'TV_SHORT'])

function formatBonus(format: string | null | undefined): number {
  if (!format) return 0
  if (format === 'TV' || format === 'MOVIE') return 0.25
  if (SPINOFF_FORMATS.has(format)) return -0.25
  return 0
}

export function rankMalAnimeMatches(siteTitle: string, entries: MalSearchEntry[]): MalSearchEntry[] {
  const scored = entries.flatMap((entry) => {
    const titles = entry.titles?.length ? entry.titles : [entry.title]
    const matched = titles.filter(title => titlesMatch(siteTitle, title))
    if (matched.length === 0) return []
    const score = Math.max(...titles.map(title => matchScore(siteTitle, title))) + formatBonus(entry.format)
    const hasContent = matched.some(title => contentOverlap(stripSeasonMarker(siteTitle), stripSeasonMarker(title)) > 0 || tokenJaccard(siteTitle, title) >= 0.3)
    return [{ entry, score, hasContent }]
  })
  if (scored.length === 0) return []
  const content = scored.filter(item => item.hasContent)
  const pool = content.length > 0 ? content : scored
  return pool.sort((a, b) => b.score - a.score).map(item => item.entry)
}

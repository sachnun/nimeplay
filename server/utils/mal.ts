import { cleanSynopsis } from './synopsis'

const ANILIST_URL = 'https://graphql.anilist.co'
const FETCH_TIMEOUT_MS = 15000
const MIN_INTERVAL_MS = 700

export interface MalCharacter {
  name: string
  imageUrl: string
  role: 'Main' | 'Supporting'
  voiceActor?: { name: string, imageUrl: string }
}

export interface MalSearchEntry {
  id: number
  title: string
  format?: string | null
  poster?: string | null
  score?: number | null
  popularity?: number | null
  season?: string | null
  year?: number | null
  status?: string | null
  genres?: string[]
}

export interface MalAnime {
  malId: number
  title: string
  poster: string | null
  synopsis: string
  score: number | null
  rank: number | null
  popularity: number | null
  season: string | null
  year: number | null
  trailerId: string | null
  studio: string | null
  source: string | null
  genres: string[]
  characters: MalCharacter[]
}

const SEARCH_QUERY = `query ($search: String) {
  Page(perPage: 15) {
    media(search: $search, type: ANIME) {
      id
      idMal
      format
      status
      averageScore
      popularity
      season
      seasonYear
      genres
      coverImage { extraLarge large }
      title { romaji english native }
    }
  }
}`

const MEDIA_QUERY = `query ($idMal: Int) {
  Media(idMal: $idMal, type: ANIME) {
    id
    idMal
    title { romaji english native }
    coverImage { extraLarge large }
    description(asHtml: false)
    averageScore
    rankings { rank type }
    popularity
    season
    seasonYear
    trailer { id site }
    studios(isMain: true) { nodes { name } }
    genres
    source
    characters(perPage: 25, sort: [ROLE, RELEVANCE]) {
      edges {
        role
        node { name { full } image { large } }
        voiceActors(language: JAPANESE) { name { full } image { large } }
      }
    }
  }
}`

interface JikanTitle {
  romaji?: string | null
  english?: string | null
  native?: string | null
}

interface AniListSearchMedia {
  id: number
  idMal: number | null
  format?: string | null
  status?: string | null
  averageScore?: number | null
  popularity?: number | null
  season?: string | null
  seasonYear?: number | null
  genres?: string[] | null
  coverImage?: { extraLarge?: string | null, large?: string | null } | null
  title: JikanTitle
}

interface AniListMedia {
  id: number
  idMal: number | null
  title: JikanTitle
  coverImage?: { extraLarge?: string | null, large?: string | null } | null
  description?: string | null
  averageScore?: number | null
  rankings?: { rank: number, type: string }[] | null
  popularity?: number | null
  season?: string | null
  seasonYear?: number | null
  trailer?: { id?: string | null, site?: string | null } | null
  studios?: { nodes?: { name: string }[] } | null
  genres?: string[] | null
  source?: string | null
  characters?: {
    edges?: {
      role?: string | null
      node?: { name?: { full?: string | null } | null, image?: { large?: string | null } | null } | null
      voiceActors?: { name?: { full?: string | null } | null, image?: { large?: string | null } | null }[] | null
    }[]
  } | null
}

let lastRequestAt = 0
let blockedUntil = 0

export function blockAniList(ms: number): void {
  blockedUntil = Math.max(blockedUntil, Date.now() + ms)
}

export async function acquireAniListSlot(): Promise<void> {
  for (;;) {
    const now = Date.now()
    const wait = Math.max(blockedUntil - now, MIN_INTERVAL_MS - (now - lastRequestAt))
    if (wait <= 0) break
    await new Promise(resolve => setTimeout(resolve, wait))
  }
  lastRequestAt = Date.now()
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await acquireAniListSlot()
    try {
      const res = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 5
        blockedUntil = Date.now() + retryAfter * 1000
        continue
      }
      if (!res.ok) return null
      const body = await res.json() as { data?: T }
      return body.data ?? null
    }
    catch {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  return null
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#0?39;|&apos;/g, '\'')
    .replace(/&quot;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .trim()
}

function stripHtml(value: string): string {
  return value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
}

function titleOf(title: JikanTitle): string {
  return decodeEntities(title.english || title.romaji || title.native || '')
}

function matchTitleOf(title: JikanTitle): string {
  return decodeEntities(title.romaji || title.english || title.native || '')
}

function sourceLabel(value: string | null | undefined): string | null {
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
  const siteBase = stripSeasonMarker(siteTitle)
  const malBase = stripSeasonMarker(malTitle)
  const score = baseScore(siteBase, malBase)
  let adjusted = score
  if (siteSeason !== null && malSeason !== null && siteSeason === malSeason) adjusted += 0.6
  if (siteSeason !== null && siteSeason > 1 && malSeason === null) adjusted -= 0.5
  if (siteSeason === null && malSeason !== null && malSeason > 1) return false
  if (adjusted >= 0.75) return true
  if (tokenJaccard(siteBase, malBase) >= 0.5 && adjusted >= 0.55) return true
  return isAbbrevOnBase(siteBase, malBase) && adjusted >= 0.4
}

export async function searchMalAnimeEntries(query: string): Promise<MalSearchEntry[]> {
  const cleaned = query
    .replace(/[!?:,.'"“”‘’]/g, ' ')
    .replace(/\s+sub\s+indo.*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return []
  const data = await graphql<{ Page?: { media?: AniListSearchMedia[] } }>(SEARCH_QUERY, { search: cleaned })
  const media = data?.Page?.media ?? []
  const entries = new Map<number, MalSearchEntry>()
  for (const item of media) {
    if (item.idMal == null) continue
    if (!entries.has(item.idMal)) {
      entries.set(item.idMal, {
        id: item.idMal,
        title: matchTitleOf(item.title),
        format: item.format ?? null,
        poster: item.coverImage?.extraLarge ?? item.coverImage?.large ?? null,
        score: item.averageScore != null ? Math.round(item.averageScore) / 10 : null,
        popularity: item.popularity ?? null,
        season: item.season ? item.season.toLowerCase() : null,
        year: item.seasonYear ?? null,
        status: item.status ?? null,
        genres: item.genres ?? [],
      })
    }
  }
  return [...entries.values()]
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

export function rankMalAnimeMatches(siteTitle: string, entries: MalSearchEntry[]): MalSearchEntry[] {
  const passing = entries.filter(entry => titlesMatch(siteTitle, entry.title))
  if (passing.length === 0) return []
  const content = passing.filter(entry => contentOverlap(stripSeasonMarker(siteTitle), stripSeasonMarker(entry.title)) > 0 || tokenJaccard(siteTitle, entry.title) >= 0.3)
  const pool = content.length > 0 ? content : passing
  return [...pool].sort((a, b) => (matchScore(siteTitle, b.title) + formatBonus(b.format)) - (matchScore(siteTitle, a.title) + formatBonus(a.format)))
}

const SPINOFF_FORMATS = new Set(['OVA', 'ONA', 'SPECIAL', 'MUSIC', 'TV_SHORT'])

function formatBonus(format: string | null | undefined): number {
  if (!format) return 0
  if (format === 'TV' || format === 'MOVIE') return 0.25
  if (SPINOFF_FORMATS.has(format)) return -0.25
  return 0
}

export async function searchMalAnime(title: string): Promise<number | null> {
  const entries = await searchMalAnimeEntries(title)
  return entries[0]?.id ?? null
}

const ROMAN_SEASONS: Record<string, number> = {
  ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12,
}
const WORD_SEASONS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
}
const JP_SEASONS: Record<string, number> = {
  ichi: 1, ni: 2, san: 3, yon: 4, shi: 4, go: 5, roku: 6, nana: 7, shichi: 7, hachi: 8, kyuu: 9, ku: 9, juu: 10,
}

export function malSearchVariants(title: string): string[] {
  const variants: string[] = []
  const push = (value: string) => {
    const cleaned = value.replace(/\s+/g, ' ').trim()
    if (cleaned && !variants.includes(cleaned)) variants.push(cleaned)
  }
  push(title)
  const seasonMatch = title.match(/(.+?)\s+Season\s+(\d+)\s*$/i)
  if (seasonMatch?.[1] && seasonMatch[2]) {
    const base = seasonMatch[1].trim()
    const num = Number(seasonMatch[2])
    const ordinals = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth']
    const romans = ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
    if (ordinals[num - 1]) push(`${base} ${ordinals[num - 1]}`)
    if (romans[num]) push(`${base} ${romans[num]}`)
    push(`${base} ${num}`)
  }
  const partMatch = title.match(/(.+?)\s+Part\s+(\d+)\s*$/i)
  if (partMatch?.[1] && partMatch[2]) {
    const base = partMatch[1].trim()
    const num = Number(partMatch[2])
    const romans = ['', '', 'II', 'III', 'IV', 'V', 'VI']
    if (romans[num]) push(`${base} ${romans[num]}`)
  }
  return variants.slice(0, 4)
}

export function seasonNumber(title: string): number | null {
  const lower = title.toLowerCase()
  const digit = /(?:(\d+)\s*(?:st|nd|rd|th)?\s*season)|(?:season\s*(\d+))|(?:\bpart\s*(\d+))|(?:\bs\s*(\d+)\b)/.exec(lower)
  if (digit) {
    for (const group of digit.slice(1)) {
      if (group !== undefined) return Number(group)
    }
  }
  const ordinal = /\b(\d+)(?:st|nd|rd|th)\b/.exec(lower)
  if (ordinal) return Number(ordinal[1])
  const trailingNumber = /\s(\d{1,2})$/.exec(lower.trim())
  if (trailingNumber) return Number(trailingNumber[1])
  const roman = /\b(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\b/.exec(lower)
  if (roman?.[1] !== undefined && roman[1] in ROMAN_SEASONS) return ROMAN_SEASONS[roman[1]]!
  const word = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/.exec(lower)
  if (word?.[1] !== undefined && word[1] in WORD_SEASONS) return WORD_SEASONS[word[1]]!
  const sono = /sono\s+(ichi|ni|san|yon|shi|go|roku|nana|shichi|hachi|kyuu|ku|juu)\b/.exec(lower)
  if (sono?.[1] !== undefined && sono[1] in JP_SEASONS) return JP_SEASONS[sono[1]]!
  const shou = /\b(ichi|ni|san|yon|shi|go|roku|nana|shichi|hachi|kyuu|ku|juu)\s+no\s+(shou|hen|ki|maku)\b/.exec(lower)
  if (shou?.[1] !== undefined && shou[1] in JP_SEASONS) return JP_SEASONS[shou[1]]!
  return null
}

function parseCharacters(media: AniListMedia): MalCharacter[] {
  const edges = media.characters?.edges ?? []
  return edges.slice(0, 25).map((edge): MalCharacter => {
    const voiceActor = edge.voiceActors?.[0]
    const vaUrl = voiceActor?.image?.large ?? ''
    return {
      name: edge.node?.name?.full ?? '',
      imageUrl: edge.node?.image?.large ?? '',
      role: edge.role === 'MAIN' ? 'Main' : 'Supporting',
      voiceActor: voiceActor?.name?.full && vaUrl
        ? { name: voiceActor.name.full, imageUrl: vaUrl }
        : undefined,
    }
  }).filter(character => character.name && character.imageUrl)
}

export async function fetchMalAnime(malId: number): Promise<MalAnime | null> {
  const data = await graphql<{ Media?: AniListMedia }>(MEDIA_QUERY, { idMal: malId })
  const media = data?.Media
  if (!media) return null

  const trailer = media.trailer && media.trailer.site === 'youtube' ? media.trailer.id ?? null : null

  return {
    malId,
    title: titleOf(media.title),
    poster: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
    synopsis: cleanSynopsis(decodeEntities(stripHtml(media.description ?? ''))),
    score: media.averageScore != null ? Math.round(media.averageScore) / 10 : null,
    rank: media.rankings?.find(entry => entry.type === 'RATED')?.rank ?? null,
    popularity: media.popularity ?? null,
    season: media.season ? media.season.toLowerCase() : null,
    year: media.seasonYear ?? null,
    trailerId: trailer,
    studio: media.studios?.nodes?.map(studio => studio.name).join(', ') || null,
    source: sourceLabel(media.source),
    genres: media.genres ?? [],
    characters: parseCharacters(media),
  }
}

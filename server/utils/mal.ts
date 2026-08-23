import { getSpoofHeaders } from './spoof'

const MAL_BASE = 'https://myanimelist.net'
const FETCH_TIMEOUT_MS = 8000

export interface MalCharacter {
  name: string
  imageUrl: string
  role: 'Main' | 'Supporting'
  voiceActor?: { name: string, imageUrl: string }
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

function decodeEntities(value: string): string {
  return value
    .replace(/&#0?39;|&apos;/g, '\'')
    .replace(/&quot;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .trim()
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: getSpoofHeaders(MAL_BASE + '/'),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    return await res.text()
  }
  catch {
    return null
  }
}

/**
 * Strict site-title vs MAL-title match. Requires:
 * 1. At least one significant shared word.
 * 2. Season markers to agree: an explicit season on one side must match the
 *    other side's marker; a missing marker counts as season 1.
 */
const TITLE_STOPWORDS = new Set(['the', 'and', 'for', 'episode', 'movie', 'special', 'ova', 'end'])

function titleWords(value: string): Set<string> {
  return new Set(
    value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(word => word.length >= 3 && !TITLE_STOPWORDS.has(word)),
  )
}

export function titlesMatch(siteTitle: string, malTitle: string): boolean {
  const siteWords = titleWords(siteTitle)
  const malWords = titleWords(malTitle)
  const hasOverlap = [...siteWords].some(word => malWords.has(word))
  if (!hasOverlap && siteWords.size > 0) return false

  const siteSeason = seasonNumber(siteTitle)
  const malSeason = seasonNumber(malTitle)
  if (siteSeason !== null && siteSeason !== malSeason) return false
  if (siteSeason === null && malSeason !== null && malSeason > 1) return false
  return true
}

export async function searchMalAnime(title: string): Promise<number | null> {
  const candidates = await searchMalAnimeCandidates(title)
  return candidates[0] ?? null
}

/** All distinct MAL ids from the search results, in result order. */
export async function searchMalAnimeCandidates(title: string): Promise<number[]> {
  const html = await fetchPage(`${MAL_BASE}/anime.php?q=${encodeURIComponent(title)}`)
  if (!html) return []
  const ids: number[] = []
  const pattern = /href="https:\/\/myanimelist\.net\/anime\/(\d+)\//g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) !== null) {
    const id = Number(match[1])
    if (!ids.includes(id)) ids.push(id)
    if (ids.length >= 8) break
  }
  return ids
}

const ROMAN_SEASONS: Record<string, number> = {
  ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12,
}
const WORD_SEASONS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
}

/**
 * Extract an explicit season/part marker from a title, e.g.
 * "5th Season", "Season 2", "S3", "Part 2", "III", "Third".
 */
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
  // Sequel titles on MAL often end with a bare number: "... Slave 2", "... Nouka 2".
  const trailingNumber = /\s(\d{1,2})$/.exec(lower.trim())
  if (trailingNumber) return Number(trailingNumber[1])
  const roman = /\b(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\b/.exec(lower)
  if (roman?.[1] !== undefined && roman[1] in ROMAN_SEASONS) return ROMAN_SEASONS[roman[1]]!
  const word = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/.exec(lower)
  if (word?.[1] !== undefined && word[1] in WORD_SEASONS) return WORD_SEASONS[word[1]]!
  return null
}

function fullSizeImage(dataSrc: string): string {
  // Drop the r/42x62/ resize prefix to get the original image.
  return dataSrc.replace(/\/r\/\d+x\d+\//, '/')
}

interface CharacterChunk {
  name: string
  imageUrl: string
  role: 'Main' | 'Supporting'
  voiceActor?: { name: string, imageUrl: string }
}

function parseCharacters(html: string): MalCharacter[] {
  const sections = html.split('h3_characters_voice_actors').slice(1)
  const result: CharacterChunk[] = []

  // Map character id -> image. On MAL the character's image anchor (class
  // "fw-n") sits in the cell BEFORE the name heading, keyed by the same id.
  const images = new Map<string, string>()
  const imgPattern = /href="https:\/\/myanimelist\.net\/character\/(\d+)\/[^"]*" class="fw-n">\s*<img[^>]*data-src="(https:\/\/cdn\.myanimelist\.net\/[^"]*\/images\/characters\/[^"]*)"/g
  let imgMatch: RegExpExecArray | null
  while ((imgMatch = imgPattern.exec(html)) !== null) {
    if (imgMatch[1] && imgMatch[2]) images.set(imgMatch[1], fullSizeImage(imgMatch[2]))
  }

  for (const section of sections) {
    // Cut at the next character entry so people links don't bleed across entries.
    const end = section.indexOf('h3_characters_voice_actors')
    const chunk = end === -1 ? section.slice(0, 3000) : section.slice(0, end)

    const nameMatch = /<a href="https:\/\/myanimelist\.net\/character\/(\d+)\/[^"]*">([^<]+)<\/a>/.exec(chunk)
    if (!nameMatch?.[1] || !nameMatch[2]) continue

    const imageUrl = images.get(nameMatch[1])
    if (!imageUrl) continue

    const roleMatch = /<small>(Main|Supporting)<\/small>/.exec(chunk)?.[1]
    if (roleMatch !== 'Main' && roleMatch !== 'Supporting') continue

    const vaMatch = /<a href="https:\/\/myanimelist\.net\/people\/\d+\/[^"]*">([^<]+)<\/a><br>\s*<small>Japanese<\/small>[\s\S]*?data-src="(https:\/\/cdn\.myanimelist\.net\/[^"]*\/images\/voiceactors\/[^"]*)"/.exec(chunk)

    result.push({
      name: decodeEntities(nameMatch[2]),
      imageUrl,
      role: roleMatch,
      voiceActor: vaMatch?.[1] && vaMatch[2]
        ? { name: decodeEntities(vaMatch[1]), imageUrl: fullSizeImage(vaMatch[2]) }
        : undefined,
    })
  }

  return result
}

/** Extract a sidebar info field (e.g. "Source:", "Studios:") as plain text. */
function parseInfoField(html: string, label: string): string {
  const marker = `<span class="dark_text">${label}</span>`
  const start = html.indexOf(marker)
  if (start === -1) return ''
  const chunk = html.slice(start + marker.length, html.indexOf('</div>', start))
  const text = chunk.replace(/<a [^>]*>/g, '').replace(/<\/?[a-z][^>]*>/gi, '')
  return decodeEntities(text).replace(/\s+/g, ' ').trim()
}

function parseGenres(html: string): string[] {
  // MAL renders genre links with relative hrefs, e.g. <a href="/anime/genre/1/Action">Action</a>
  const names = new Set<string>()
  const pattern = /href="\/anime\/genre\/\d+\/[^"]*"[^>]*>([^<]+)</g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) !== null) {
    names.add(decodeEntities(match[1] ?? '').trim())
  }
  return [...names]
}

export async function fetchMalAnime(malId: number): Promise<MalAnime | null> {
  const html = await fetchPage(`${MAL_BASE}/anime/${malId}`)
  if (!html) return null

  // Canonical URL slug, e.g. /anime/40028/Shingeki_no_Kyojin:_The_Final_Season
  const canonicalMatch = /<link rel="canonical" href="https:\/\/myanimelist\.net\/anime\/\d+\/([^"]+)"/.exec(html)?.[1]
  const title = canonicalMatch ? decodeURIComponent(canonicalMatch.replace(/_/g, ' ')) : ''
  const posterMatch = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1] ?? null

  const synopsisMatch = /<meta property="og:description" content="([^"]*)"/.exec(html)?.[1]
  const scoreMatch = /itemprop="ratingValue"[^>]*>([0-9.]+)</.exec(html)?.[1]
  const rankMatch = /Ranked:<\/span>\s*#(\d+)/.exec(html)?.[1]
  const popularityMatch = /Popularity:<\/span>\s*#(\d+)/.exec(html)?.[1]
  const premieredSeason = /Premiered:<\/span>\s*<a[^>]*>([A-Za-z]+) (\d{4})<\/a>/.exec(html)
  const trailerId = /youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]+)/.exec(html)?.[1]
  const characters = parseCharacters(html)

  const hasAnyData = Boolean(synopsisMatch || scoreMatch || characters.length > 0)
  if (!hasAnyData) return null

  return {
    malId,
    title,
    poster: posterMatch && posterMatch.includes('/images/anime/') ? fullSizeImage(posterMatch) : null,
    synopsis: synopsisMatch ? decodeEntities(synopsisMatch.replaceAll('\\n', '\n')) : '',
    score: scoreMatch ? Number(scoreMatch) : null,
    rank: rankMatch ? Number(rankMatch) : null,
    popularity: popularityMatch ? Number(popularityMatch) : null,
    season: premieredSeason?.[1]?.toLowerCase() ?? null,
    year: premieredSeason?.[2] ? Number(premieredSeason[2]) : null,
    trailerId: trailerId ?? null,
    studio: parseInfoField(html, 'Studios:') ?? null,
    source: parseInfoField(html, 'Source:'),
    genres: parseGenres(html),
    characters,
  }
}

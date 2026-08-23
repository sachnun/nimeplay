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

export async function searchMalAnime(title: string): Promise<number | null> {
  const html = await fetchPage(`${MAL_BASE}/anime.php?q=${encodeURIComponent(title)}`)
  if (!html) return null
  const match = html.match(/href="https:\/\/myanimelist\.net\/anime\/(\d+)\//)
  return match ? Number(match[1]) : null
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

  for (const section of sections) {
    // Cut at the next character entry so people links don't bleed across entries.
    const end = section.indexOf('h3_characters_voice_actors')
    const chunk = end === -1 ? section.slice(0, 3000) : section.slice(0, end)

    const nameMatch = /<a href="https:\/\/myanimelist\.net\/character\/\d+\/[^"]*">([^<]+)<\/a>/.exec(chunk)?.[1]
    if (!nameMatch) continue

    const imgMatch = /data-src="(https:\/\/cdn\.myanimelist\.net\/[^"]*\/images\/characters\/[^"]*)"/.exec(chunk)?.[1]
    if (!imgMatch) continue

    const roleMatch = /<small>(Main|Supporting)<\/small>/.exec(chunk)?.[1]
    if (roleMatch !== 'Main' && roleMatch !== 'Supporting') continue

    const vaMatch = /<a href="https:\/\/myanimelist\.net\/people\/\d+\/[^"]*">([^<]+)<\/a><br>\s*<small>Japanese<\/small>[\s\S]*?data-src="(https:\/\/cdn\.myanimelist\.net\/[^"]*\/images\/voiceactors\/[^"]*)"/.exec(chunk)

    result.push({
      name: decodeEntities(nameMatch),
      imageUrl: fullSizeImage(imgMatch),
      role: roleMatch,
      voiceActor: vaMatch?.[1] && vaMatch[2]
        ? { name: decodeEntities(vaMatch[1]), imageUrl: fullSizeImage(vaMatch[2]) }
        : undefined,
    })
  }

  return result
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
    genres: parseGenres(html),
    characters,
  }
}

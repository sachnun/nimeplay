const STOPWORDS = new Set(['season', 'part', 'movie', 'special', 'specials', 'ova', 'ona', 'final', 'first', 'second', 'third', 'fourth', 'fifth', 'subtitle', 'indonesia', 'indo', 'the', 'and', 'for', 'with', 'from'])

const SPINOFF_MARKERS = [/\bcm\b/, /\bomake\b/, /\bspecials?\b/, /\bbonus\b/, /\brecap\b/, /\bpicture drama\b/, /\bpilot\b/, /\bpreview\b/, /\bshort\b/, /\bmovie\b/, /\bova\b/, /\bona\b/, /剧场版/, /劇場版/]

export function normalizeTitleKey(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '')
}

export function cleanTitle(value: string): string {
  return value
    .replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ')
    .replace(/\s+sub(title)?\s*indo(nesia)?\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function baseTitle(value: string): string {
  return cleanTitle(value)
    .replace(/\s+(?:season\s*\d+|\d+\s*(?:st|nd|rd|th)\s+season|s\d+|part\s*\d+)\s*$/i, '')
    .trim()
}

export function tokenizeTitle(value: string): string[] {
  return value.toLowerCase().normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(token => token.length >= 4 && !STOPWORDS.has(token))
}

export function bracketVariants(value: string): string[] {
  const inner = [...value.matchAll(/[([\uFF08]([^)\]\uFF09]+)[)\]\uFF09]/g)].map(match => match[1]!.trim()).filter(item => item.length >= 3)
  return [...new Set([value, cleanTitle(value), ...inner])]
}

export function isSpinoffTitle(candidate: string, query: string): boolean {
  const c = candidate.toLowerCase()
  const q = query.toLowerCase()
  return SPINOFF_MARKERS.some(marker => marker.test(c) && !marker.test(q))
}

const MOVIE_MARKERS = /\b(movie|film|gekijouban)\b|剧场版|劇場版/i
const SEASON_MARKERS = /(season\s*\d+|\bs\s*\d+\b|\d+\s*(?:st|nd|rd|th)\s+season|temporada|saison|staffel|seizoen|sezon)/i

export function isMovieTitle(value: string): boolean {
  return MOVIE_MARKERS.test(value)
}

export function isSeasonTitle(value: string): boolean {
  return SEASON_MARKERS.test(value)
}

export function movieSeasonClash(siteTitle: string, malTitle: string): boolean {
  return isMovieTitle(malTitle) && !isMovieTitle(siteTitle) && isSeasonTitle(siteTitle)
}

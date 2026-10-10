export function normalizeTitleKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '')
}

export function cleanTitle(value: string): string {
  return value
    .replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ')
    .replace(/\s+sub(title)?\s*indo(nesia)?\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const MOVIE_MARKERS = /\b(movie|film|gekijouban)\b|剧场版|劇場版/i
const SEASON_MARKERS =
  /(season\s*\d+|\bs\s*\d+\b|\d+\s*(?:st|nd|rd|th)\s+season|temporada|saison|staffel|seizoen|sezon)/i

export function isMovieTitle(value: string): boolean {
  return MOVIE_MARKERS.test(value)
}

export function isSeasonTitle(value: string): boolean {
  return SEASON_MARKERS.test(value)
}

export function movieSeasonClash(siteTitle: string, malTitle: string): boolean {
  return isMovieTitle(malTitle) && !isMovieTitle(siteTitle) && isSeasonTitle(siteTitle)
}

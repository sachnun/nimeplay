const ANIME_SHEET_QUERY = '(max-width: 1023px)'

export const ANIME_SHEET_DETAIL_RE = /^\/anime\/[^/]+\/?$/

export function isAnimeSheetViewport(): boolean {
  return Boolean(import.meta.client && typeof window !== 'undefined' && window.matchMedia(ANIME_SHEET_QUERY).matches)
}

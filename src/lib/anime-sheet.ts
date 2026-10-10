const ANIME_SHEET_DEVICE_QUERY = '(hover: none) and (pointer: coarse)'

export const ANIME_SHEET_DETAIL_RE = /^\/anime\/[^/]+\/?$/

export function isAnimeSheetDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(ANIME_SHEET_DEVICE_QUERY).matches
}

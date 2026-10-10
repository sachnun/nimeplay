interface AnimeSheetState {
  malId: number
  basePath: string
  open: boolean
  closing: boolean
}

const initial: AnimeSheetState = { malId: 0, basePath: '/', open: false, closing: false }

export const animeSheet = $state<AnimeSheetState>({ ...initial })

function hasFakeEntry(): boolean {
  return Boolean((history.state as { animeSheet?: boolean } | null)?.animeSheet)
}

export function openAnimeSheet(malId: number, basePath: string, url: string): void {
  animeSheet.malId = malId
  animeSheet.basePath = basePath
  animeSheet.open = true
  animeSheet.closing = false
  history.pushState({ ...history.state, animeSheet: true }, '', url)
}

export function dropFakeEntry(): void {
  if (hasFakeEntry()) history.replaceState({ ...history.state, animeSheet: false }, '', animeSheet.basePath)
}

export function markAnimeSheetClosed(): void {
  animeSheet.open = false
  animeSheet.closing = false
}

export function requestAnimeSheetClosing(): void {
  if (animeSheet.open && !animeSheet.closing) animeSheet.closing = true
}

export { hasFakeEntry }

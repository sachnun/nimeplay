export interface AnimeSheetState {
  malId: number
  basePath: string
  open: boolean
  closing: boolean
}

function hasFakeEntry() {
  return Boolean((history.state as { animeSheet?: boolean } | null)?.animeSheet)
}

export function useAnimeSheet() {
  const state = useState<AnimeSheetState>('anime-sheet', () => ({
    malId: 0,
    basePath: '/',
    open: false,
    closing: false,
  }))

  function open(malId: number, basePath: string, url: string) {
    state.value = { malId, basePath, open: true, closing: false }
    history.pushState({ ...(history.state || {}), animeSheet: true }, '', url)
  }

  function dropFakeEntry() {
    if (hasFakeEntry()) history.replaceState({ ...(history.state || {}), animeSheet: false }, '', state.value.basePath)
  }

  function markClosed() {
    state.value = { ...state.value, open: false, closing: false }
  }

  function requestClosing() {
    if (state.value.open && !state.value.closing) state.value = { ...state.value, closing: true }
  }

  return { state, open, dropFakeEntry, markClosed, requestClosing, hasFakeEntry }
}

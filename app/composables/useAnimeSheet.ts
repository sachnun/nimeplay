export interface AnimeSheetState {
  malId: number
  basePath: string
  url: string
  open: boolean
  closing: boolean
  suspended: boolean
}

function hasFakeEntry() {
  return Boolean((history.state as { animeSheet?: boolean } | null)?.animeSheet)
}

export function useAnimeSheet() {
  const state = useState<AnimeSheetState>('anime-sheet', () => ({
    malId: 0,
    basePath: '/',
    url: '',
    open: false,
    closing: false,
    suspended: false,
  }))

  function open(malId: number, basePath: string, url: string) {
    state.value = { malId, basePath, url, open: true, closing: false, suspended: false }
    history.pushState({ ...(history.state || {}), animeSheet: true }, '', url)
  }

  function dropFakeEntry() {
    if (hasFakeEntry()) history.replaceState({ ...(history.state || {}), animeSheet: false }, '', state.value.basePath)
  }

  function markClosed() {
    state.value = { ...state.value, open: false, closing: false, suspended: false }
  }

  function suspend() {
    if (!state.value.open) return
    state.value = { ...state.value, open: false, closing: false, suspended: true }
  }

  function resume() {
    if (!state.value.suspended) return
    state.value = { ...state.value, open: true, closing: false, suspended: false }
    history.pushState({ ...(history.state || {}), animeSheet: true }, '', state.value.url)
  }

  function requestClosing() {
    if (state.value.open && !state.value.closing) state.value = { ...state.value, closing: true }
  }

  return { state, open, dropFakeEntry, markClosed, suspend, resume, requestClosing, hasFakeEntry }
}

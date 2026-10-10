import { onMount } from 'svelte'

export function useMediaQuery(query: string): () => boolean {
  let matches = $state(true)

  onMount(() => {
    const mql = window.matchMedia(query)
    matches = mql.matches
    const onChange = (event: MediaQueryListEvent) => {
      matches = event.matches
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  })

  return () => matches
}

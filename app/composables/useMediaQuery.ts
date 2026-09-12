export function useMediaQuery(query: string) {
  const matches = ref(true)
  let mql: MediaQueryList | null = null
  const onChange = (event: MediaQueryListEvent) => {
    matches.value = event.matches
  }
  onMounted(() => {
    mql = window.matchMedia(query)
    matches.value = mql.matches
    mql.addEventListener('change', onChange)
  })
  onUnmounted(() => {
    mql?.removeEventListener('change', onChange)
  })
  return matches
}

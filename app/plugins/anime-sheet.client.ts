export default defineNuxtPlugin((nuxtApp) => {
  const sheet = useAnimeSheet()

  nuxtApp.$router.beforeEach((to, from) => {
    if (sheet.state.value.open) {
      sheet.markClosed()
      sheet.dropFakeEntry()
    }
    if (!from.meta.browse) return
    if (!ANIME_SHEET_DETAIL_RE.test(to.path)) return
    if (!nuxtApp.$device.isMobileOrTablet || !isAnimeSheetViewport()) return
    sheet.open(Number(to.params.malId), from.fullPath, to.fullPath)
    return false
  })

  window.addEventListener('popstate', () => {
    if (sheet.state.value.open) sheet.requestClosing()
  })
})

export default defineNuxtPlugin((nuxtApp) => {
  const sheet = useAnimeSheet()
  let pendingResume = false

  function basePath() {
    return sheet.state.value.basePath.split(/[?#]/)[0]
  }

  nuxtApp.$router.beforeEach((to, from) => {
    if (sheet.state.value.open) {
      const leavingToDeeper = !ANIME_SHEET_DETAIL_RE.test(to.path) && to.path !== basePath()
      if (leavingToDeeper) sheet.suspend()
      else sheet.markClosed()
      sheet.dropFakeEntry()
    }
    if (!from.meta.browse) return
    if (!ANIME_SHEET_DETAIL_RE.test(to.path)) return
    if (!isMobileAnimeSheet()) return
    sheet.open(Number(to.params.malId), from.fullPath, to.fullPath)
    return false
  })

  nuxtApp.$router.afterEach((to) => {
    if (!pendingResume) return
    pendingResume = false
    if (to.path === basePath()) sheet.resume()
  })

  window.addEventListener('popstate', () => {
    if (sheet.state.value.open) {
      sheet.requestClosing()
      return
    }
    if (sheet.state.value.suspended) pendingResume = true
  })
})

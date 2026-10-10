<script lang="ts">
  import '../app.css'
  import AnimeSheetHost from '#lib/components/AnimeSheetHost.svelte'
  import { ANIME_SHEET_DETAIL_RE, isAnimeSheetViewport } from '#lib/anime-sheet'
  import {
    animeSheet,
    dropFakeEntry,
    markAnimeSheetClosed,
    openAnimeSheet,
    requestAnimeSheetClosing,
  } from '#lib/anime-sheet.svelte'
  import { beforeNavigate } from '$app/navigation'
  import { onMount } from 'svelte'
  let { children } = $props()

  beforeNavigate(navigation => {
    if (animeSheet.open) {
      markAnimeSheetClosed()
      dropFakeEntry()
    }
    const from = navigation.from
    if (!from?.route.id?.includes('(browse)')) return
    if (!navigation.to) return
    if (!ANIME_SHEET_DETAIL_RE.test(navigation.to.url.pathname)) return
    if (!isAnimeSheetViewport()) return
    const malId = Number(navigation.to.params?.malId)
    openAnimeSheet(malId, from.url.pathname + from.url.search, navigation.to.url.pathname)
    navigation.cancel()
  })

  function onPopstate() {
    if (animeSheet.open) requestAnimeSheetClosing()
  }

  onMount(() => {
    window.addEventListener('popstate', onPopstate)

    if ('scrollRestoration' in window.history) {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (nav?.type === 'reload') {
        window.history.scrollRestoration = 'manual'
        window.scrollTo(0, 0)
      }
    }

    return () => window.removeEventListener('popstate', onPopstate)
  })
</script>

<main>
  {@render children()}
</main>
<AnimeSheetHost />

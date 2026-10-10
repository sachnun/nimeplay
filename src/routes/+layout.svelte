<script lang="ts">
  import '../app.css'
  import AnimeSheetHost from '#lib/components/AnimeSheetHost.svelte'
  import { animeSheet, requestAnimeSheetClosing } from '#lib/anime-sheet.svelte'
  import { trackNavigation } from '#lib/back-navigation'
  import { onMount } from 'svelte'
  let { children } = $props()

  trackNavigation()

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

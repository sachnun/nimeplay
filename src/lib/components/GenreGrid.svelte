<script lang="ts">
  import type { GenreAnimeCard } from '#lib/shared/types'
  import { fetchGenrePage } from '#lib/api'
  import { isServerError } from '#lib/error'
  import { progressMapStore } from '#lib/progress-map.svelte'
  import { onMount } from 'svelte'
  import AnimePosterCard from './AnimePosterCard.svelte'
  import EmptyState from './EmptyState.svelte'

  interface PageData {
    anime: GenreAnimeCard[]
    totalPages: number
  }

  let { genreSlug, initialData }: { genreSlug: string; initialData?: PageData } = $props()

  let sentinelRef: HTMLDivElement | null = $state(null)
  let gridRef: HTMLDivElement | null = $state(null)
  let pages = $state<PageData[]>(initialData ? [initialData] : [])
  let size = $state(initialData ? 1 : 0)
  let loading = $state(false)
  let loadError = $state(false)
  let loadServerError = $state(false)

  const allAnime = $derived(pages.flatMap(d => d.anime))
  const showPlane = $derived(loadError && loadServerError && allAnime.length === 0)
  const totalPages = $derived(pages[0]?.totalPages ?? 1)
  const isEnd = $derived(size >= totalPages)

  const animeCards = $derived(allAnime.map(anime => {
    const progress = progressMapStore.value.get(anime.malId)
    const latest = Number(anime.episodes?.match(/\d+/)?.[0])
    return {
      anime,
      to: `/anime/${anime.malId}`,
      badge: anime.episodes && /\d/.test(anime.episodes) ? anime.episodes : '',
      newEpisode: progress?.latestEpisode !== undefined && Number.isFinite(latest) && latest > progress.latestEpisode,
      resumeTo: progress ? `/anime/${anime.malId}/${progress.episodeNumber}` : undefined,
      subtitle: progress ? `Lanjutkan EP ${progress.episodeNumber}` : anime.date,
      progressPct: progress && progress.duration > 0 ? (progress.currentTime / progress.duration) * 100 : undefined,
    }
  }))

  async function loadMore() {
    if (loading || isEnd) return
    loading = true
    loadError = false
    loadServerError = false
    let loaded = false
    try {
      const next = size + 1
      pages = [...pages, await fetchGenrePage(fetch, genreSlug, next)]
      size = next
      loaded = true
    } catch (err) {
      loadError = true
      loadServerError = isServerError(err)
    } finally {
      loading = false
    }
    if (loaded) await fillViewport()
  }

  function isSentinelNearViewport() {
    if (!sentinelRef || isEnd) return false
    const rect = sentinelRef.getBoundingClientRect()
    return rect.top <= window.innerHeight * 3 && rect.bottom >= -800
  }

  async function fillViewport() {
    await new Promise(resolve => requestAnimationFrame(resolve))
    if (isSentinelNearViewport()) void loadMore()
  }

  let observer: IntersectionObserver | null = null

  onMount(() => {
    void progressMapStore.sync()
    observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) void loadMore()
      },
      { rootMargin: '200% 0px' },
    )
    if (sentinelRef) observer.observe(sentinelRef)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void progressMapStore.sync()
    }
    document.addEventListener('visibilitychange', onVisibility)
    if (pages.length === 0) void loadMore()

    return () => {
      observer?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  })
</script>

<div>
  <div
    bind:this={gridRef}
    class="grid grid-cols-2 [@media(min-width:640px)_and_(min-height:601px)]:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] [@media(min-width:640px)_and_(max-height:600px)]:[grid-template-columns:repeat(auto-fill,minmax(130px,1fr))] gap-4"
  >
    {#each animeCards as card, i (card.anime.malId + '-' + i)}
      <AnimePosterCard
        to={card.to}
        thumbnail={card.anime.thumbnail}
        title={card.anime.title}
        badge={card.badge}
        newEpisode={card.newEpisode}
        subtitle={card.subtitle}
        resumeTo={card.resumeTo}
        progressPct={card.progressPct}
        priority={i < 10}
      />
    {/each}
  </div>
  {#if showPlane}
    <EmptyState />
  {/if}
  <div bind:this={sentinelRef} class="py-4">
    {#if loadError && !showPlane}
      <button type="button" class="block mx-auto text-sm text-zinc-400 hover:text-white" onclick={loadMore}>
        Gagal memuat anime. Coba lagi
      </button>
    {/if}
  </div>
</div>

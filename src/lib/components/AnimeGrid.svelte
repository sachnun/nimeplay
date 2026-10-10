<script lang="ts">
  import type { AnimeCard } from '#lib/shared/types'
  import { fetchAnimePage } from '#lib/api'
  import { isServerError } from '#lib/error'
  import { progressMapStore } from '#lib/progress-map.svelte'
  import { onMount } from 'svelte'
  import AnimePosterCard from './AnimePosterCard.svelte'
  import EmptyState from './EmptyState.svelte'

  interface PageData {
    anime: AnimeCard[]
    totalPages: number
  }

  let {
    pageType,
    initialData,
    showDay = true,
    nextPageType = undefined,
    nextInitialData = undefined,
    nextShowDay = false,
  }: {
    pageType: 'ONGOING' | 'COMPLETED'
    initialData: PageData
    showDay?: boolean
    nextPageType?: 'ONGOING' | 'COMPLETED'
    nextInitialData?: PageData
    nextShowDay?: boolean
  } = $props()

  let sentinelRef: HTMLDivElement | null = $state(null)
  let gridRef: HTMLDivElement | null = $state(null)
  let primaryPages = $state<PageData[]>([initialData])
  let nextPages = $state<PageData[]>([])
  let primarySize = $state(1)
  let nextSize = $state(0)
  let loading = $state(false)
  let loadError = $state(false)
  let loadServerError = $state(false)

  const primaryAnime = $derived(primaryPages.flatMap(d => d.anime))
  const totalPages = $derived(primaryPages[0]?.totalPages ?? 1)
  const primaryEnd = $derived(primarySize >= totalPages)
  const nextAnime = $derived(primaryEnd ? nextPages.flatMap(d => d.anime) : [])
  const nextTotalPages = $derived(nextPages[0]?.totalPages ?? 1)
  const nextEnd = $derived(!nextPageType || (primaryEnd && nextSize >= nextTotalPages))
  const isEnd = $derived(primaryEnd && nextEnd)

  const displayCards = $derived([
    ...primaryAnime.map(anime => ({ anime, isFromNext: false })),
    ...nextAnime.map(anime => ({ anime, isFromNext: true })),
  ].map(({ anime, isFromNext }) => {
    const progress = progressMapStore.value.get(anime.malId)
    const resumeTo = progress ? `/anime/${anime.malId}/${progress.episodeNumber}` : undefined
    const showDate = anime.day && (isFromNext ? nextShowDay : showDay)
    const latest = Number(anime.episode.match(/\d+/)?.[0])
    const num = anime.episode.match(/\d+/)?.[0]
    return {
      anime,
      badge: num ? `${num} Eps` : '',
      newEpisode: progress?.latestEpisode !== undefined && Number.isFinite(latest) && latest > progress.latestEpisode,
      to: `/anime/${anime.malId}`,
      resumeTo,
      subtitle: progress
        ? `Lanjutkan EP ${progress.episodeNumber}`
        : showDate
          ? anime.date
            ? `${anime.day} · ${anime.date}`
            : anime.day
          : anime.date,
      progressPct: progress && progress.duration > 0 ? (progress.currentTime / progress.duration) * 100 : undefined,
    }
  }))

  const hasAnyCard = $derived(primaryAnime.length > 0 || nextAnime.length > 0)
  const showPlane = $derived(loadError && loadServerError && !hasAnyCard)

  async function loadNextAvailablePage() {
    if (!primaryEnd) {
      const nextPage = primarySize + 1
      primaryPages = [...primaryPages, await fetchAnimePage(fetch, pageType, nextPage)]
      primarySize = nextPage
      return
    }
    if (nextPageType && !nextEnd) {
      const nextPage = nextSize + 1
      const data =
        nextPage === 1 && nextInitialData
          ? nextInitialData
          : await fetchAnimePage(fetch, nextPageType, nextPage)
      nextPages = [...nextPages, data]
      nextSize = nextPage
    }
  }

  async function loadMore() {
    if (loading || isEnd) return
    loading = true
    loadError = false
    loadServerError = false
    let loaded = false
    try {
      await loadNextAvailablePage()
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
    void fillViewport()

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
    {#each displayCards as card, i (card.anime.malId + '-' + i)}
      <AnimePosterCard
        to={card.to}
        thumbnail={card.anime.thumbnail}
        title={card.anime.title}
        badge={card.badge}
        newEpisode={card.newEpisode}
        subtitle={card.subtitle}
        resumeTo={card.resumeTo}
        progressPct={card.progressPct}
        priority={i < 6}
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

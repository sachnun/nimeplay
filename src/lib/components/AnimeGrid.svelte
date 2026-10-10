<script lang="ts">
  import type { AnimeCard } from '#lib/shared/types'
  import { listAnime } from '#lib/remote/catalog.remote'
  import { isServerError } from '#lib/error'
  import { progressMap, syncProgressMap } from '#lib/progress-map'
  import { snapshot, afterNavigate } from '$app/navigation'
  import { onMount, tick } from 'svelte'
  import AnimePosterCard from './AnimePosterCard.svelte'
  import EmptyState from './EmptyState.svelte'

  interface PageData {
    anime: AnimeCard[]
    totalPages: number
  }

  interface GridSnapshot {
    primaryPages: PageData[]
    nextPages: PageData[]
    primarySize: number
    nextSize: number
    scrollY: number
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
  const initialPrimaryPages = () => [initialData]
  let primaryPages = $state<PageData[]>(initialPrimaryPages())
  let nextPages = $state<PageData[]>([])
  let primarySize = $state(initialPrimaryPages().length)
  let nextSize = $state(0)
  let loading = $state(false)
  let loadError = $state(false)
  let loadServerError = $state(false)

  function gridId(): string {
    return `anime-grid:${pageType}:${nextPageType ?? ''}`
  }

  let restored = false
  afterNavigate(navigation => {
    restored = navigation.type === 'popstate'
  })

  snapshot<GridSnapshot>({
    id: gridId(),
    capture: () => ({ primaryPages, nextPages, primarySize, nextSize, scrollY: window.scrollY }),
    restore: async value => {
      if (!restored) return
      primaryPages = value.primaryPages
      nextPages = value.nextPages
      primarySize = value.primarySize
      nextSize = value.nextSize
      await tick()
      window.scrollTo(0, value.scrollY)
    },
  })

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
    const progress = progressMap.get(anime.malId)
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
      primaryPages = [...primaryPages, await listAnime({ status: pageType, page: nextPage })]
      primarySize = nextPage
      return
    }
    if (nextPageType && !nextEnd) {
      const nextPage = nextSize + 1
      const data =
        nextPage === 1 && nextInitialData
          ? nextInitialData
          : await listAnime({ status: nextPageType, page: nextPage })
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

  function onVisibility() {
    if (document.visibilityState === 'visible') void syncProgressMap()
  }

  onMount(() => {
    void syncProgressMap()
    observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) void loadMore()
      },
      { rootMargin: '200% 0px' },
    )
    if (sentinelRef) observer.observe(sentinelRef)

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
    class="grid justify-center justify-items-center gap-4 [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))] [@media(min-width:640px)_and_(min-height:601px)]:[grid-template-columns:repeat(auto-fill,minmax(160px,1fr))] [@media(max-height:600px)]:[grid-template-columns:repeat(auto-fill,minmax(110px,1fr))]"
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

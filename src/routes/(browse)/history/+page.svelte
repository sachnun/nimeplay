<script lang="ts">
  import { fetchAnimeSummaries } from '#lib/summaries'
  import { getContinueWatching, removeAnimeProgress, clearAllProgress, type WatchProgress } from '#lib/storage'
  import { goto } from '$app/navigation'
  import { onMount } from 'svelte'
  import AnimePosterCard from '#lib/components/AnimePosterCard.svelte'

  interface HistoryItem extends WatchProgress {
    title: string
    thumbnail: string
  }

  let items = $state<HistoryItem[]>([])
  let loading = $state(true)
  let clearing = $state(false)

  async function loadHistory() {
    loading = true
    try {
      const progressList = await getContinueWatching()
      if (progressList.length === 0) {
        items = []
        await goto('/', { replaceState: true })
        return
      }
      const summaries = await fetchAnimeSummaries(fetch, progressList.map(entry => entry.malId)).catch(() => [])
      const summaryById = new Map(summaries.map(summary => [summary.malId, summary]))
      items = progressList
        .flatMap(entry => {
          const summary = summaryById.get(entry.malId)
          return summary ? [{ ...entry, title: summary.title, thumbnail: summary.thumbnail }] : []
        })
        .toSorted((a, b) => b.updatedAt - a.updatedAt)
    } finally {
      loading = false
    }
  }

  async function removeItem(malId: number) {
    await removeAnimeProgress(malId)
    items = items.filter(item => item.malId !== malId)
    if ((await getContinueWatching()).length === 0) await goto('/', { replaceState: true })
  }

  async function clearHistory() {
    if (clearing || items.length === 0) return
    clearing = true
    try {
      await clearAllProgress()
      items = []
      await goto('/', { replaceState: true })
    } finally {
      clearing = false
    }
  }

  function progressPct(item: HistoryItem) {
    if (!item.duration || item.duration <= 0) return 0
    return Math.min((item.currentTime / item.duration) * 100, 100)
  }

  onMount(() => {
    void loadHistory()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void loadHistory()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  })
</script>

<svelte:head>
  <title>History - Nimeplay</title>
</svelte:head>

<div class="px-6 py-8">
  <div class="flex items-center gap-2 mb-6">
    <a
      href="/"
      title="Kembali"
      aria-label="Kembali"
      class="px-3 py-1.5 rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors shrink-0 flex items-center"
    >
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
      </svg>
    </a>
    <h1 class="text-lg font-semibold text-zinc-100">History</h1>
    <div class="flex-1"></div>
    <button
      type="button"
      disabled={clearing || loading || items.length === 0}
      class="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors cursor-pointer disabled:opacity-50"
      onclick={clearHistory}
    >
      {clearing ? 'Clearing...' : 'Clear'}
    </button>
  </div>

  {#if items.length > 0}
    <div
      class="anime-grid"
    >
      {#each items as item (item.malId)}
        <AnimePosterCard
          to={`/anime/${item.malId}`}
          thumbnail={item.thumbnail}
          title={item.title}
          subtitle={`Lanjutkan EP ${item.episodeNumber}`}
          resumeTo={`/anime/${item.malId}/${item.episodeNumber}`}
          progressPct={progressPct(item)}
          fullRounded
        >
          {#snippet overlay()}
            <button
              type="button"
              title="Hapus dari history"
              aria-label="Hapus dari history"
              class="absolute top-2 left-2 p-1.5 rounded-full bg-black/60 text-zinc-300 hover:text-white hover:bg-black/80 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
              onclick={e => {
                e.stopPropagation()
                e.preventDefault()
                void removeItem(item.malId)
              }}
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          {/snippet}
        </AnimePosterCard>
      {/each}
    </div>
  {/if}
</div>

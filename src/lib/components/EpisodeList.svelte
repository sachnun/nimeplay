<script lang="ts">
  import { loadEpisodeHeader } from '#lib/remote/episode.remote'
  import { episodeOpacity, getEpisodeProgressMap, progressKey, statusFromRatio } from '#lib/storage'
  import { onMount } from 'svelte'

  let { episodes, malId }: { episodes: number[]; malId: number } = $props()

  let episodeProgress = $state<Record<string, number>>({})
  const reversedEpisodes = $derived(episodes.toReversed())
  const prefetched = new Set<number>()

  async function refreshEpisodeProgress() {
    episodeProgress = await getEpisodeProgressMap(malId)
  }

  function prefetchEpisode(number: number) {
    if (prefetched.has(number)) return
    prefetched.add(number)
    loadEpisodeHeader({ malId, episodeNumber: number }).catch(() => {
      prefetched.delete(number)
    })
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') void refreshEpisodeProgress()
  }

  function episodeRatio(number: number): number {
    return episodeProgress[progressKey(malId, number)] ?? 0
  }

  function episodeClass(number: number) {
    const status = statusFromRatio(episodeRatio(number))
    if (status === 'completed') return 'bg-white/10 text-white/35'
    if (status === 'in_progress') return 'bg-white/10 text-white/50'
    return 'bg-white/15 text-white hover:bg-white/25 active:bg-white/25'
  }

  $effect(() => {
    void malId
    prefetched.clear()
    void refreshEpisodeProgress()
  })

  onMount(() => {
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  })
</script>

{#if episodes.length === 0}
  <p class="text-zinc-500 text-sm">No episodes available yet.</p>
{:else}
  <div>
    <div
      class="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2 [content-visibility:auto] [contain-intrinsic-size:auto_200px]"
      data-episode-grid
    >
      {#each reversedEpisodes as number (number)}
        <a
          href={`/anime/${malId}/${number}`}
          class="episode-cell {episodeClass(number)}"
          style:opacity={episodeOpacity(episodeRatio(number))}
          onmouseenter={() => prefetchEpisode(number)}
          onfocus={() => prefetchEpisode(number)}
          ontouchstart={() => prefetchEpisode(number)}
        >
          {number}
        </a>
      {/each}
    </div>
  </div>
{/if}

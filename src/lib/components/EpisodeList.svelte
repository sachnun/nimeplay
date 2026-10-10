<script lang="ts">
  import { getEpisodeStatusMap, progressKey } from '#lib/storage'
  import { onMount } from 'svelte'

  let { episodes, malId }: { episodes: number[]; malId: number } = $props()

  let episodeStatuses = $state<Record<string, import('#lib/types').WatchProgressStatus>>({})
  const reversedEpisodes = $derived(episodes.toReversed())

  async function refreshEpisodeStatuses() {
    episodeStatuses = await getEpisodeStatusMap(malId)
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') void refreshEpisodeStatuses()
  }

  function episodeClass(number: number) {
    const status = episodeStatuses[progressKey(malId, number)] ?? 'unstarted'
    if (status === 'completed') return 'bg-white/10 text-white/35 opacity-50'
    if (status === 'in_progress') return 'bg-white/10 text-white/50 opacity-75'
    return 'bg-white/15 text-white hover:bg-white/25 active:bg-white/25'
  }

  $effect(() => {
    void malId
    void refreshEpisodeStatuses()
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
          class="relative text-sm py-2 rounded text-center transition-colors {episodeClass(number)}"
        >
          {number}
        </a>
      {/each}
    </div>
  </div>
{/if}

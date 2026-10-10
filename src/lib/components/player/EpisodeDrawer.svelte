<script lang="ts">
  import { getEpisodeStatus, progressKey } from '#lib/storage'
  import { onMount } from 'svelte'

  let {
    malId,
    episodes,
    currentEpisodeNumber,
    onclose,
    onnavigate,
  }: {
    malId: number
    episodes: number[]
    currentEpisodeNumber: number
    onclose: () => void
    onnavigate: (episodeNumber: number) => void
  } = $props()

  let listRef: HTMLDivElement | null = $state(null)
  let statuses = $state<Record<string, import('#lib/types').WatchProgressStatus>>({})

  async function loadStatuses() {
    const entries = await Promise.all(
      episodes.map(async number => {
        const key = progressKey(malId, number)
        return [key, await getEpisodeStatus(key)] as const
      }),
    )
    statuses = Object.fromEntries(entries)
  }

  function epStatus(number: number): import('#lib/types').WatchProgressStatus {
    return statuses[progressKey(malId, number)] ?? 'unstarted'
  }

  onMount(() => {
    void loadStatuses()
    requestAnimationFrame(() => {
      const active = listRef?.querySelector<HTMLElement>('[data-current="true"]')
      active?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  })
</script>

<div
  class="absolute inset-0 z-[25] cursor-pointer"
  role="button"
  tabindex="-1"
  aria-label="Close"
  onclick={onclose}
  onkeydown={e => {
    if (e.key === 'Enter') onclose()
  }}
></div>
<div class="absolute top-0 right-0 bottom-0 z-30 w-64 md:w-72 backdrop-blur-2xl bg-black/50 border-l border-white/10 flex flex-col">
  <div class="flex items-center justify-between px-4 py-3 border-b border-white/10">
    <h2 class="text-sm font-semibold text-white">Episodes</h2>
    <button
      type="button"
      aria-label="Tutup"
      class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
      onclick={onclose}
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
    </button>
  </div>
  <div bind:this={listRef} class="flex-1 overflow-y-auto p-3 scrollbar-thin">
    <div class="grid grid-cols-4 md:grid-cols-5 gap-2">
      {#each [...episodes].reverse() as number (number)}
        <button
          type="button"
          data-current={number === currentEpisodeNumber ? 'true' : undefined}
          class="relative flex items-center justify-center text-sm py-2.5 rounded-lg transition-all cursor-pointer {number === currentEpisodeNumber ? 'bg-white/25 text-white font-semibold' : epStatus(number) === 'completed' ? 'bg-white/5 text-zinc-600 opacity-55' : epStatus(number) === 'in_progress' ? 'bg-white/5 text-zinc-400 opacity-75' : 'bg-white/5 text-zinc-300 hover:bg-white/15'}"
          onclick={() => number !== currentEpisodeNumber && onnavigate(number)}
        >
          {number}
        </button>
      {/each}
    </div>
  </div>
</div>

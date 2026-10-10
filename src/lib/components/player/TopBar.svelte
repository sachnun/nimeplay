<script lang="ts">
  import { goto } from '$app/navigation'
  import { MediaQuery } from 'svelte/reactivity'

  let {
    title,
    malId,
    episodeCount,
    currentEpisodeNum,
    controlsVisible,
    showEpisodes,
    ontoggleEpisodes,
  }: {
    title: string
    malId: number
    episodeCount: number
    currentEpisodeNum: number
    controlsVisible: boolean
    showEpisodes: boolean
    ontoggleEpisodes: () => void
  } = $props()

  const isMobilePortraitControls = new MediaQuery(
    '(hover: none) and (pointer: coarse) and (max-width: 767px) and (orientation: portrait)',
    true,
  )

  function goBack() {
    const detailPath = `/anime/${malId}`
    const back = (window.history.state as { back?: string } | null)?.back
    if (back === detailPath) history.back()
    else void goto(detailPath, { replaceState: true })
  }
</script>

<div
  class="absolute top-0 left-0 right-0 z-20 px-4 md:px-8 pt-4 pb-12 bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-opacity duration-300 pointer-events-none"
  class:opacity-100={controlsVisible}
  class:opacity-0={!controlsVisible}
>
  <div class="flex items-center gap-3" class:pointer-events-auto={controlsVisible} class:pointer-events-none={!controlsVisible}>
    <button type="button" class="group/back flex items-center gap-3 min-w-0 cursor-pointer text-left" onclick={goBack}>
      <div class="flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-white/15 group-hover/back:bg-white/25 transition-colors">
        <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </div>
      <h1 class="text-sm md:text-base font-semibold text-white/90 truncate">{title}</h1>
    </button>
    <div class="flex-1"></div>
    {#if episodeCount > 1 && isMobilePortraitControls.current}
      <button
        class="hidden [@media_(hover:none)_and_(pointer:coarse)_and_(max-width:767px)_and_(orientation:portrait)]:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer {showEpisodes ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}"
        onclick={ontoggleEpisodes}
      >
        EP {currentEpisodeNum}
      </button>
    {/if}
  </div>
</div>

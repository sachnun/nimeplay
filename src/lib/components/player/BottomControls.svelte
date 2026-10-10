<script lang="ts">
  import type { SkipTime } from '#lib/types'
  import { formatTime } from '#lib/player/media'
  import { MediaQuery } from 'svelte/reactivity'

  let {
    autoSkip = false,
    bufferedPct = 0,
    controlsVisible = true,
    currentEpisodeNum = 0,
    currentTime = 0,
    duration = 0,
    episodeCount = 0,
    isFullscreen = false,
    isMuted = false,
    isPlaying = false,
    isSeeking = false,
    nextEpisode = null,
    prevEpisode = null,
    progress = 0,
    showEpisodes = false,
    showVolume = false,
    skipTimes = [],
    volume = 1,
    onchangeVolume,
    onhideVolume,
    onnavigate,
    onseekCommit,
    onseekPreview,
    onseekStart,
    onshowVolume,
    ontoggleAutoSkip,
    ontoggleEpisodes,
    ontoggleFullscreen,
    ontoggleMute,
    ontogglePlay,
  }: {
    autoSkip?: boolean
    bufferedPct?: number
    controlsVisible?: boolean
    currentEpisodeNum?: number
    currentTime?: number
    duration?: number
    episodeCount?: number
    isFullscreen?: boolean
    isMuted?: boolean
    isPlaying?: boolean
    isSeeking?: boolean
    nextEpisode?: { num: number } | null
    prevEpisode?: { num: number } | null
    progress?: number
    showEpisodes?: boolean
    showVolume?: boolean
    skipTimes?: SkipTime[]
    volume?: number
    onchangeVolume: (value: number) => void
    onhideVolume: () => void
    onnavigate: (episodeNumber: number) => void
    onseekCommit: (value: number) => void
    onseekPreview: (value: number) => void
    onseekStart: () => void
    onshowVolume: () => void
    ontoggleAutoSkip: () => void
    ontoggleEpisodes: () => void
    ontoggleFullscreen: () => void
    ontoggleMute: () => void
    ontogglePlay: () => void
  } = $props()

  const isDesktopLayout = new MediaQuery('(min-width: 768px)', true)

  let trackRef: HTMLElement | null = $state(null)
  let dragging = $state(false)
  let activePointer: number | null = null

  function timeAtX(clientX: number) {
    const el = trackRef
    const dur = duration
    if (!el || !dur) return null
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return null
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * dur
  }

  function onSeekPointerDown(event: PointerEvent) {
    if (event.button !== 0 || !duration || !trackRef) return
    event.preventDefault()
    activePointer = event.pointerId
    dragging = true
    try {
      trackRef.setPointerCapture(event.pointerId)
    } catch (error) {
      console.warn('setPointerCapture failed', error)
    }
    onseekStart()
    const time = timeAtX(event.clientX)
    if (time !== null) onseekPreview(time)
  }

  function onSeekPointerMove(event: PointerEvent) {
    if (!dragging || event.pointerId !== activePointer) return
    const time = timeAtX(event.clientX)
    if (time !== null) onseekPreview(time)
  }

  function onSeekPointerUp(event: PointerEvent) {
    if (!dragging || event.pointerId !== activePointer) return
    const time = timeAtX(event.clientX)
    dragging = false
    activePointer = null
    if (time !== null) onseekCommit(time)
  }

  function onSeekPointerCancel() {
    if (!dragging) return
    dragging = false
    activePointer = null
    onseekCommit(currentTime)
  }

  function onSeekKeydown(event: KeyboardEvent) {
    const step = event.key === 'ArrowLeft' ? -5 : event.key === 'ArrowRight' ? 5 : 0
    if (!step) return
    event.preventDefault()
    event.stopPropagation()
    onseekCommit(Math.max(0, Math.min(currentTime + step, duration || 0)))
  }

  function onVolumeInput(event: Event) {
    onchangeVolume(Number((event.target as HTMLInputElement).value))
  }
</script>

<div
  class="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-300 pointer-events-none"
  class:opacity-100={controlsVisible}
  class:opacity-0={!controlsVisible}
>
  <div
    class="px-4 md:px-8 pb-4 [@media_(hover:none)_and_(pointer:coarse)]:pb-[max(1rem,env(safe-area-inset-bottom))] pt-20 transition-opacity"
    class:pointer-events-auto={controlsVisible}
    class:pointer-events-none={!controlsVisible}
  >
    <div
      bind:this={trackRef}
      class="group/prog relative w-full cursor-pointer py-3 touch-none"
      role="slider"
      tabindex="0"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={duration || 0}
      aria-valuenow={currentTime}
      onpointerdown={onSeekPointerDown}
      onpointermove={onSeekPointerMove}
      onpointerup={onSeekPointerUp}
      onpointercancel={onSeekPointerCancel}
      onkeydown={onSeekKeydown}
    >
      <div
        class="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full bg-white/20 transition-[height] {isSeeking ? 'h-2' : 'h-1 group-hover/prog:h-2'}"
      ></div>
      <div
        class="absolute top-1/2 left-0 -translate-y-1/2 rounded-full bg-white/30 transition-[height] {isSeeking ? 'h-2' : 'h-1 group-hover/prog:h-2'}"
        style:width="{bufferedPct}%"
      ></div>
      {#each skipTimes as skip (`${skip.skipType}-${skip.interval.startTime}`)}
        <div
          class="absolute top-1/2 -translate-y-1/2 rounded-full transition-[height] {skip.skipType === 'op' || skip.skipType === 'mixed-op' ? 'bg-white/35' : 'bg-white/15'} {isSeeking ? 'h-2' : 'h-1 group-hover/prog:h-2'}"
          style:left="{(skip.interval.startTime / duration) * 100}%"
          style:width="{((skip.interval.endTime - skip.interval.startTime) / duration) * 100}%"
        ></div>
      {/each}
      <div
        class="absolute top-1/2 left-0 -translate-y-1/2 rounded-full bg-white transition-[height] {isSeeking ? 'h-2' : 'h-1 group-hover/prog:h-2'}"
        style:width="{progress}%"
      ></div>
      <div
        class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md transition-opacity {isSeeking ? 'opacity-100 scale-110' : 'opacity-0 group-hover/prog:opacity-100'}"
        style:left="{progress}%"
      ></div>
      {#if dragging}
        <div
          class="absolute bottom-full -translate-x-1/2 mb-1 px-2 py-0.5 rounded bg-black/80 text-white text-xs font-mono tabular-nums pointer-events-none"
          style:left="{Math.min(96, Math.max(4, progress))}%"
        >
          {formatTime(currentTime)}
        </div>
      {/if}
    </div>

    <div class="flex items-center gap-1 md:gap-2">
      <button class="w-9 h-9 flex items-center justify-center text-white hover:text-white/80 transition-colors cursor-pointer" aria-label={isPlaying ? 'Pause' : 'Play'} onclick={ontogglePlay}>
        {#if isPlaying}
          <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
        {:else}
          <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        {/if}
      </button>
      {#if prevEpisode}
        <button class="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer" aria-label="Episode sebelumnya" onclick={() => onnavigate(prevEpisode.num)}>
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" /></svg>
        </button>
      {/if}
      {#if nextEpisode}
        <button class="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer" aria-label="Episode selanjutnya" onclick={() => onnavigate(nextEpisode.num)}>
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M16 18h2V6h-2v12zM4 18l8.5-6L4 6v12z" /></svg>
        </button>
      {/if}
      <span class="text-xs text-white/70 font-mono tabular-nums select-none whitespace-nowrap">{formatTime(currentTime)} / {formatTime(duration)}</span>
      <div class="flex-1"></div>
      {#if episodeCount > 1 && isDesktopLayout.current}
        <button
          class="hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer {showEpisodes ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}"
          onclick={ontoggleEpisodes}
        >
          EP {currentEpisodeNum}
        </button>
      {/if}
      {#if skipTimes.length > 0}
        <button
          class="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded transition-colors cursor-pointer {autoSkip ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}"
          onclick={ontoggleAutoSkip}
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
          <span class="hidden md:inline">Auto Skip</span>
        </button>
      {/if}
      <div class="relative flex items-center" role="group" aria-label="Volume" onmouseenter={onshowVolume} onmouseleave={onhideVolume}>
        <button class="w-9 h-9 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer" aria-label="Mute" onclick={ontoggleMute}>
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path
              d={isMuted || volume === 0
                ? 'M4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z'
                : 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z'}
            />
          </svg>
        </button>
        <div class="hidden md:flex items-center overflow-hidden transition-all duration-200" class:w-20={showVolume} class:opacity-100={showVolume} class:ml-1={showVolume} class:w-0={!showVolume} class:opacity-0={!showVolume}>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            aria-label="Volume"
            class="vol-slider w-full h-1 appearance-none rounded-full cursor-pointer touch-none"
            style:background="linear-gradient(to right, #fff {(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.3) {(isMuted ? 0 : volume) * 100}%)"
            oninput={onVolumeInput}
          />
        </div>
      </div>
      <button class="w-9 h-9 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer" aria-label="Fullscreen" onclick={ontoggleFullscreen}>
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d={isFullscreen
              ? 'M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25'
              : 'M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15'}
          />
        </svg>
      </button>
    </div>
  </div>
</div>

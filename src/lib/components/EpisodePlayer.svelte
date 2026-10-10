<script lang="ts">
  import type { EpisodeMeta } from '#lib/types'
  import { createEpisodePlayer } from '#lib/player/episode-player.svelte'
  import { goto } from '$app/navigation'
  import { onMount } from 'svelte'
  import PlayerLoadingShell from './player/LoadingShell.svelte'
  import PlayerTopBar from './player/TopBar.svelte'
  import PlayerBottomControls from './player/BottomControls.svelte'
  import PlayerEpisodeDrawer from './player/EpisodeDrawer.svelte'

  let {
    malId,
    episodeNumber,
    episode,
    episodes,
    animeTitle,
    animeThumbnail,
  }: {
    malId: number
    episodeNumber: number
    episode: EpisodeMeta
    episodes: number[]
    animeTitle: string
    animeThumbnail: string
  } = $props()

  const player = createEpisodePlayer(
    () => ({ malId, episodeNumber, episode, episodes, animeTitle, animeThumbnail }),
    url => void goto(url, { replaceState: true }),
  )

  let containerEl: HTMLDivElement | null = $state(null)
  let videoEl: HTMLVideoElement | null = $state(null)

  onMount(() => {
    player.setContainer(containerEl)
    player.setVideo(videoEl)
    player.mount()
    return () => player.unmount()
  })
</script>

<div
  bind:this={containerEl}
  class="player-shell fixed inset-0 bg-black z-50"
  class:cursor-default={player.controlsVisible}
  class:cursor-none={!player.controlsVisible}
>
  <video
    bind:this={videoEl}
    class="absolute inset-0 w-full h-full object-contain"
    class:hidden={!player.showNative}
    playsinline
    disableRemotePlayback
  ></video>

  {#if player.showNative}
    <div
      class="absolute inset-0 z-10 touch-none select-none"
      role="presentation"
      ontouchstart={player.handleVideoTouchStart}
      ontouchmove={player.handleVideoTouchMove}
      ontouchend={player.handleVideoTouchEnd}
      ontouchcancel={player.handleVideoTouchCancel}
      onpointerdown={player.handleVideoPointerDown}
      onpointermove={player.handleVideoPointerMove}
      onpointerup={player.handleVideoPointerUp}
      onpointercancel={player.handleVideoPointerCancel}
      oncontextmenu={e => e.preventDefault()}
    ></div>
  {/if}

  {#if player.showLoading}
    <div class="absolute inset-0 z-10" role="button" tabindex="-1" ondblclick={player.toggleFullscreen} onkeydown={() => {}}>
      <PlayerLoadingShell className="absolute inset-0 bg-black" message={player.loadingMessage} header={false} controlsSkeleton={false} />
    </div>
  {/if}

  {#if player.showEmpty}
    <div class="absolute inset-0 flex items-center justify-center text-zinc-500">Stream tidak tersedia</div>
  {/if}

  {#if player.seekIndicator}
    {#key player.seekIndicatorKey}
      <div
        class="absolute top-0 bottom-0 z-[15] flex items-center justify-center pointer-events-none w-[30%] {player.seekIndicator.side === 'left' ? 'left-0' : 'right-0'}"
      >
        <div class="flex flex-col items-center gap-1 animate-[seekPulse_0.6s_ease-out_forwards]">
          <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path
              d={player.seekIndicator.side === 'left'
                ? 'M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z'
                : 'M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z'}
            />
          </svg>
          <span class="text-sm font-semibold text-white tabular-nums">{player.seekIndicator.seconds}s</span>
        </div>
      </div>
    {/key}
  {/if}

  {#if player.volumeIndicator}
    <div class="overlay-center">
      <div class="hud-pill">
        <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path
            d={player.volumeIndicator.isMuted || player.volumeIndicator.volume === 0
              ? 'M4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z'
              : 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z'}
          />
        </svg>
        <span class="text-sm font-semibold text-white tabular-nums">
          {player.volumeIndicator.isMuted ? 0 : Math.round(player.volumeIndicator.volume * 100)}%
        </span>
      </div>
    </div>
  {/if}

  {#if player.speedBoost}
    <div class="overlay-center">
      <div class="hud-pill">
        <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" /></svg>
        <span class="text-sm font-semibold text-white">3x</span>
      </div>
    </div>
  {/if}

  {#if player.showNative && !player.isPlaying && !player.showLoading && player.autoNextCountdown === null}
    <div
      class="absolute inset-0 z-[11] flex items-center justify-center pointer-events-none transition-opacity duration-300"
      class:opacity-100={player.controlsVisible}
      class:opacity-0={!player.controlsVisible}
    >
      <button
        class="relative w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/15 flex items-center justify-center pointer-events-auto hover:bg-white/25 transition-colors cursor-pointer before:absolute before:-inset-8 before:content-['']"
        aria-label="Play"
        onclick={player.togglePlay}
      >
        <svg class="w-8 h-8 md:w-10 md:h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
      </button>
    </div>
  {/if}

  <PlayerTopBar
    title={player.episode.title}
    {malId}
    episodeCount={episodes.length}
    currentEpisodeNum={player.currentEpisodeNum}
    controlsVisible={player.controlsVisible}
    showEpisodes={player.showEpisodes}
    ontoggleEpisodes={player.toggleEpisodesPanel}
  />

  {#if player.autoNextCountdown !== null}
    <div class="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-30">
      <p class="text-zinc-200 text-lg mb-4">
        Episode selanjutnya dalam <span class="font-bold text-white">{player.autoNextCountdown}</span> detik
      </p>
      <div class="flex gap-3">
        <button
          type="button"
          class="px-5 py-2 bg-zinc-100 hover:bg-white text-zinc-900 text-sm font-semibold rounded-md transition-colors cursor-pointer"
          onclick={player.goNextNow}
        >
          Putar Sekarang
        </button>
        <button
          type="button"
          class="px-5 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-semibold rounded-md transition-colors cursor-pointer"
          onclick={player.cancelAutoNext}
        >
          Batal
        </button>
      </div>
    </div>
  {/if}

  {#if player.showNative || player.resolving}
    <PlayerBottomControls
      autoSkip={player.autoSkip}
      bufferedPct={player.bufferedPct}
      controlsVisible={player.controlsVisible}
      currentEpisodeNum={player.currentEpisodeNum}
      currentTime={player.currentTime}
      duration={player.duration}
      episodeCount={episodes.length}
      isFullscreen={player.isFullscreen}
      isMuted={player.isMuted}
      isPlaying={player.isPlaying}
      isSeeking={player.isSeeking}
      nextEpisode={player.nextEpisode}
      prevEpisode={player.prevEpisode}
      progress={player.progress}
      showEpisodes={player.showEpisodes}
      showVolume={player.showVolume}
      skipTimes={player.skipTimes}
      volume={player.volume}
      onchangeVolume={player.changeVolume}
      onhideVolume={player.hideVolumeControl}
      onnavigate={player.navigateEpisode}
      onseekCommit={player.onSeekCommit}
      onseekPreview={player.onSeekPreview}
      onseekStart={player.onSeekStart}
      onshowVolume={player.showVolumeControl}
      ontoggleAutoSkip={player.toggleAutoSkip}
      ontoggleEpisodes={player.toggleEpisodesPanel}
      ontoggleFullscreen={player.toggleFullscreen}
      ontoggleMute={player.toggleMute}
      ontogglePlay={player.togglePlay}
    />
  {/if}

  {#if player.showEpisodes && episodes.length > 1}
    <PlayerEpisodeDrawer
      {malId}
      {episodes}
      currentEpisodeNumber={player.currentEpisodeNum}
      onclose={player.toggleEpisodesPanel}
      onnavigate={player.navigateEpisode}
    />
  {/if}
</div>

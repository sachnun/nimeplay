<script setup lang="ts">
import type { EpisodeData } from '~/utils/types'

const props = defineProps<{
  episode: EpisodeData
  currentSlug: string
  animeSlug: string
  animeThumbnail: string
  currentEpisodeNum: string
}>()

const {
  activeQualityLabel,
  autoNextCountdown,
  autoSkip,
  bufferedPct,
  cancelAutoNext,
  changeVolume,
  containerRef,
  controlsVisible,
  currentEpisodeNum,
  currentSlug,
  currentTime,
  duration,
  episode,
  goNextNow,
  handleSpeedHoldStart,
  handleZoneTap,
  hideVolumeControl,
  iframeSrc,
  isFullscreen,
  isMuted,
  isPlaying,
  isSeeking,
  loadingMessage,
  navigateEpisode,
  nextEpisode,
  onProgressDown,
  prevEpisode,
  progress,
  qualityOptions,
  seekIndicator,
  seekIndicatorKey,
  showEmbedAlert,
  showEmpty,
  showEpisodes,
  showIframe,
  showLoading,
  showNative,
  showVolume,
  showVolumeControl,
  skipTimes,
  speedBoost,
  toggleAutoSkip,
  toggleEpisodesPanel,
  toggleFullscreen,
  toggleMute,
  togglePlay,
  toggleQuality,
  videoRef,
  volume,
  wasLongPress,
} = useEpisodePlayer(props)
</script>

<template>
  <div ref="containerRef" class="player-shell fixed inset-0 bg-black z-50" :class="controlsVisible ? 'cursor-default' : 'cursor-none'">
    <video v-show="showNative" ref="videoRef" class="absolute inset-0 w-full h-full object-contain" playsinline />

    <div v-if="showNative" class="absolute inset-0 z-10 flex">
      <div class="w-[30%] h-full" @click="handleZoneTap('left')" />
      <div class="w-[40%] h-full" @click="handleZoneTap('center')" />
      <div class="w-[30%] h-full" @pointerdown="handleSpeedHoldStart" @contextmenu.prevent @click="!wasLongPress && handleZoneTap('right')" />
    </div>

    <iframe v-if="showIframe && !showEmbedAlert" :src="iframeSrc || undefined" class="absolute inset-0 w-full h-full" allowfullscreen allow="fullscreen" />
    <PlayerEmbedPrompt
      v-if="showIframe && showEmbedAlert"
      :back-to="episode.animeSlug ? `/${episode.animeSlug}` : `/${animeSlug}`"
      @continue="showEmbedAlert = false"
    />

    <div v-if="showLoading" class="absolute inset-0 z-10" @dblclick="toggleFullscreen">
      <PlayerLoadingShell class-name="absolute inset-0 bg-black" :message="loadingMessage" />
    </div>

    <div v-if="showEmpty" class="absolute inset-0 flex items-center justify-center text-zinc-500">No player available</div>
    <PlayerSeekIndicator v-if="seekIndicator" :key="seekIndicatorKey" :indicator="seekIndicator" />

    <div v-if="speedBoost" class="absolute inset-0 z-[15] flex items-center justify-center pointer-events-none">
      <div class="flex items-center gap-2 px-4 py-2 rounded-full bg-black/60 backdrop-blur-sm">
        <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" /></svg>
        <span class="text-sm font-semibold text-white">3x</span>
      </div>
    </div>

    <div
      v-if="showNative && !isPlaying && !showLoading && autoNextCountdown === null"
      class="absolute inset-0 z-[11] flex items-center justify-center pointer-events-none transition-opacity duration-300"
      :class="controlsVisible ? 'opacity-100' : 'opacity-0'"
    >
      <button class="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/15 flex items-center justify-center pointer-events-auto hover:bg-white/25 transition-colors cursor-pointer" @click="togglePlay">
        <svg class="w-8 h-8 md:w-10 md:h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
      </button>
    </div>

    <PlayerTopBar
      :episode="episode"
      :current-episode-num="currentEpisodeNum"
      :controls-visible="controlsVisible"
      :show-iframe="showIframe"
      :show-episodes="showEpisodes"
      :quality-count="qualityOptions.length"
      :active-quality-label="activeQualityLabel"
      @toggle-episodes="toggleEpisodesPanel"
      @toggle-quality="toggleQuality"
    />

    <PlayerAutoNextOverlay
      v-if="autoNextCountdown !== null"
      :countdown="autoNextCountdown"
      @next="goNextNow"
      @cancel="cancelAutoNext"
    />

    <PlayerBottomControls
      v-if="showNative && !showLoading"
      :active-quality-label="activeQualityLabel"
      :auto-skip="autoSkip"
      :buffered-pct="bufferedPct"
      :controls-visible="controlsVisible"
      :current-episode-num="currentEpisodeNum"
      :current-time="currentTime"
      :duration="duration"
      :episode-count="episode.episodeNav.length"
      :is-fullscreen="isFullscreen"
      :is-muted="isMuted"
      :is-playing="isPlaying"
      :is-seeking="isSeeking"
      :next-episode="nextEpisode"
      :prev-episode="prevEpisode"
      :progress="progress"
      :quality-count="qualityOptions.length"
      :show-episodes="showEpisodes"
      :show-volume="showVolume"
      :skip-times="skipTimes"
      :volume="volume"
      @change-volume="changeVolume"
      @hide-volume="hideVolumeControl"
      @navigate="navigateEpisode"
      @progress-down="onProgressDown"
      @show-volume="showVolumeControl"
      @toggle-auto-skip="toggleAutoSkip"
      @toggle-episodes="toggleEpisodesPanel"
      @toggle-fullscreen="toggleFullscreen"
      @toggle-mute="toggleMute"
      @toggle-play="togglePlay"
      @toggle-quality="toggleQuality"
    />

    <PlayerEpisodeDrawer
      v-if="showEpisodes && episode.episodeNav.length > 1"
      :episode="episode"
      :current-slug="currentSlug"
      @close="toggleEpisodesPanel"
      @navigate="navigateEpisode"
    />
  </div>
</template>

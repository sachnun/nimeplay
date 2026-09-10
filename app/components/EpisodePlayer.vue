<script setup lang="ts">
import type { EpisodeData, InitialSource } from '~/utils/types'

const props = defineProps<{
  malId: number
  episodeNumber: number
  episode: EpisodeData
  episodes: number[]
  animeTitle: string
  animeThumbnail: string
  initialSource?: InitialSource | null
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
  currentTime,
  duration,
  episode,
  goNextNow,
  handleVideoPointerCancel,
  handleVideoPointerDown,
  handleVideoPointerMove,
  handleVideoPointerUp,
  handleVideoTouchCancel,
  handleVideoTouchEnd,
  handleVideoTouchMove,
  handleVideoTouchStart,
  hideVolumeControl,
  isFullscreen,
  isMuted,
  isPlaying,
  isSeeking,
  loadingMessage,
  navigateEpisode,
  nextEpisode,
  onSeekCommit,
  onSeekPreview,
  onSeekStart,
  prevEpisode,
  progress,
  qualityOptions,
  resolving,
  scrubPreview,
  seekIndicator,
  seekIndicatorKey,
  showEmpty,
  showEpisodes,
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
  volumeIndicator,
} = useEpisodePlayer(props)
</script>

<template>
  <div ref="containerRef" class="player-shell fixed inset-0 bg-black z-50" :class="controlsVisible ? 'cursor-default' : 'cursor-none'" :data-tv-nav-scope="showNative && !isPlaying && !showLoading && !showEpisodes && autoNextCountdown === null ? '' : undefined">
    <video v-show="showNative" ref="videoRef" class="absolute inset-0 w-full h-full object-contain" playsinline />

    <div v-if="showNative" class="absolute inset-0 z-10 touch-none select-none" @touchstart="handleVideoTouchStart" @touchmove="handleVideoTouchMove" @touchend="handleVideoTouchEnd" @touchcancel="handleVideoTouchCancel" @pointerdown="handleVideoPointerDown" @pointermove="handleVideoPointerMove" @pointerup="handleVideoPointerUp" @pointercancel="handleVideoPointerCancel" @contextmenu.prevent />

    <div v-if="showLoading" class="absolute inset-0 z-10" @dblclick="toggleFullscreen">
      <PlayerLoadingShell class-name="absolute inset-0 bg-black" :message="loadingMessage" :header="false" :controls-skeleton="false" />
    </div>

    <div v-if="showEmpty" class="absolute inset-0 flex items-center justify-center text-zinc-500">Stream tidak tersedia</div>
    <div v-if="seekIndicator" :key="seekIndicatorKey" class="absolute inset-0 z-[15] flex items-center justify-center pointer-events-none">
      <div class="flex flex-col items-center gap-1 px-4 py-2 rounded-xl bg-black/70 backdrop-blur-sm animate-[seekPulse_0.6s_ease-out_forwards]">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path :d="seekIndicator.side === 'left' ? 'M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z' : 'M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z'" />
          </svg>
          <span class="text-sm font-semibold tabular-nums" :class="seekIndicator.side === 'right' ? 'text-emerald-300' : 'text-amber-300'">{{ seekIndicator.side === 'right' ? '+' : '-' }}{{ seekIndicator.seconds }}s</span>
        </div>
        <span class="text-sm font-semibold text-white tabular-nums">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
      </div>
    </div>
    <div v-if="scrubPreview" class="absolute inset-0 z-[15] flex items-center justify-center pointer-events-none">
      <div class="flex flex-col items-center gap-1 px-4 py-2 rounded-xl bg-black/70 backdrop-blur-sm">
        <span class="text-sm font-semibold text-white tabular-nums">{{ formatTime(scrubPreview.current) }} / {{ formatTime(duration) }}</span>
        <span class="text-xs font-medium tabular-nums" :class="scrubPreview.delta >= 0 ? 'text-emerald-300' : 'text-amber-300'">{{ scrubPreview.delta >= 0 ? '+' : '' }}{{ Math.round(scrubPreview.delta) }}s</span>
      </div>
    </div>
    <Transition name="osd-fade">
      <div v-if="volumeIndicator" class="absolute inset-0 z-[15] flex items-center justify-center pointer-events-none">
        <div class="flex items-center gap-2 px-4 py-2 rounded-full bg-black/60 backdrop-blur-sm">
          <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path :d="volumeIndicator.isMuted || volumeIndicator.volume === 0 ? 'M4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z' : volumeIndicator.volume < 0.33 ? 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z' : 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z'" />
          </svg>
          <span class="text-sm font-semibold text-white tabular-nums">{{ volumeIndicator.isMuted ? 0 : Math.round(volumeIndicator.volume * 100) }}%</span>
        </div>
      </div>
    </Transition>

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
      :title="episode.title"
      :mal-id="malId"
      :episode-count="episodes.length"
      :current-episode-num="currentEpisodeNum"
      :controls-visible="controlsVisible"
      :show-episodes="showEpisodes"
      :quality-count="qualityOptions.length"
      :active-quality-label="activeQualityLabel"
      @toggle-episodes="toggleEpisodesPanel"
      @toggle-quality="toggleQuality"
    />

    <div v-if="autoNextCountdown !== null" data-tv-nav-scope class="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-30">
      <p class="text-zinc-200 text-lg mb-4">
        Episode selanjutnya dalam <span class="font-bold text-white">{{ autoNextCountdown }}</span> detik
      </p>
      <div class="flex gap-3">
        <button type="button" class="px-5 py-2 bg-zinc-100 hover:bg-white text-zinc-900 text-sm font-semibold rounded-md transition-colors cursor-pointer" @click="goNextNow">
          Putar Sekarang
        </button>
        <button type="button" class="px-5 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-semibold rounded-md transition-colors cursor-pointer" @click="cancelAutoNext">
          Batal
        </button>
      </div>
    </div>

    <PlayerBottomControls
      v-if="showNative || resolving"
      :active-quality-label="activeQualityLabel"
      :auto-skip="autoSkip"
      :buffered-pct="bufferedPct"
      :controls-visible="controlsVisible"
      :current-episode-num="currentEpisodeNum"
      :current-time="currentTime"
      :disabled="showLoading"
      :duration="duration"
      :episode-count="episodes.length"
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
      @seek-commit="onSeekCommit"
      @seek-preview="onSeekPreview"
      @seek-start="onSeekStart"
      @show-volume="showVolumeControl"
      @toggle-auto-skip="toggleAutoSkip"
      @toggle-episodes="toggleEpisodesPanel"
      @toggle-fullscreen="toggleFullscreen"
      @toggle-mute="toggleMute"
      @toggle-play="togglePlay"
      @toggle-quality="toggleQuality"
    />

    <PlayerEpisodeDrawer
      v-if="showEpisodes && episodes.length > 1"
      :mal-id="malId"
      :episodes="episodes"
      :current-episode-number="currentEpisodeNum"
      @close="toggleEpisodesPanel"
      @navigate="navigateEpisode"
    />
  </div>
</template>

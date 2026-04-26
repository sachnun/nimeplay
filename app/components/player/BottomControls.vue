<script setup lang="ts">
import type { SkipTime } from '~/utils/types'
import { formatTime } from '~/utils/player'

defineProps<{
  activeQualityLabel: string
  autoSkip: boolean
  bufferedPct: number
  controlsVisible: boolean
  currentEpisodeNum: string
  currentTime: number
  duration: number
  episodeCount: number
  isFullscreen: boolean
  isMuted: boolean
  isPlaying: boolean
  isSeeking: boolean
  nextEpisode: { slug: string; num: string } | null
  prevEpisode: { slug: string; num: string } | null
  progress: number
  qualityCount: number
  showEpisodes: boolean
  showVolume: boolean
  skipTimes: SkipTime[]
  volume: number
}>()

defineEmits<{
  changeVolume: [value: number]
  hideVolume: []
  navigate: [slug: string, episodeNum: string]
  progressDown: [event: MouseEvent | TouchEvent]
  showVolume: []
  toggleAutoSkip: []
  toggleEpisodes: []
  toggleFullscreen: []
  toggleMute: []
  togglePlay: []
  toggleQuality: []
}>()
</script>

<template>
  <div class="player-bottom-controls absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-300 pointer-events-none" :class="controlsVisible ? 'opacity-100' : 'opacity-0'">
    <div class="px-4 md:px-8 pb-4 pt-20" :class="controlsVisible ? 'pointer-events-auto' : 'pointer-events-none'">
      <div class="group/prog relative w-full cursor-pointer mb-2 py-2 -my-1" @mousedown="$emit('progressDown', $event)" @touchstart="$emit('progressDown', $event)">
        <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full bg-white/20 transition-all" :class="isSeeking ? 'h-2' : 'h-1 group-hover/prog:h-2'" />
        <div class="absolute top-1/2 left-0 -translate-y-1/2 rounded-full bg-white/30 transition-all" :class="isSeeking ? 'h-2' : 'h-1 group-hover/prog:h-2'" :style="{ width: `${bufferedPct}%` }" />
        <div
          v-for="skip in skipTimes"
          :key="`${skip.skipType}-${skip.interval.startTime}`"
          class="absolute top-1/2 -translate-y-1/2 rounded-full transition-all"
          :class="[(skip.skipType === 'op' || skip.skipType === 'mixed-op') ? 'bg-white/35' : 'bg-white/15', isSeeking ? 'h-2' : 'h-1 group-hover/prog:h-2']"
          :style="{ left: `${(skip.interval.startTime / duration) * 100}%`, width: `${((skip.interval.endTime - skip.interval.startTime) / duration) * 100}%` }"
        />
        <div class="absolute top-1/2 left-0 -translate-y-1/2 rounded-full bg-white transition-all" :class="isSeeking ? 'h-2' : 'h-1 group-hover/prog:h-2'" :style="{ width: `${progress}%` }" />
        <div class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md transition-opacity" :class="isSeeking ? 'opacity-100 scale-110' : 'opacity-0 group-hover/prog:opacity-100'" :style="{ left: `${progress}%` }" />
      </div>

      <div class="flex items-center gap-1 md:gap-2">
        <button class="w-9 h-9 flex items-center justify-center text-white hover:text-white/80 transition-colors cursor-pointer" @click="$emit('togglePlay')">
          <svg v-if="isPlaying" class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
          <svg v-else class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        </button>
        <button v-if="prevEpisode" class="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer" @click="$emit('navigate', prevEpisode.slug, prevEpisode.num)">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" /></svg>
        </button>
        <button v-if="nextEpisode" class="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer" @click="$emit('navigate', nextEpisode.slug, nextEpisode.num)">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M16 18h2V6h-2v12zM4 18l8.5-6L4 6v12z" /></svg>
        </button>
        <span class="text-xs text-white/70 font-mono tabular-nums select-none whitespace-nowrap">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
        <div class="flex-1" />
        <button v-if="episodeCount > 1" class="hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer" :class="showEpisodes ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'" @click="$emit('toggleEpisodes')">
          EP {{ currentEpisodeNum }}
        </button>
        <button v-if="qualityCount > 1" class="hidden md:block text-xs px-2.5 py-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors font-medium cursor-pointer" @click="$emit('toggleQuality')">
          {{ activeQualityLabel }}
        </button>
        <button v-if="skipTimes.length > 0" class="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded transition-colors cursor-pointer" :class="autoSkip ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'" @click="$emit('toggleAutoSkip')">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" :stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
          <span class="hidden md:inline">Auto Skip</span>
        </button>
        <div class="relative hidden md:flex items-center" @mouseenter="$emit('showVolume')" @mouseleave="$emit('hideVolume')">
          <button class="w-9 h-9 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer" @click="$emit('toggleMute')">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path :d="isMuted || volume === 0 ? 'M4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z' : 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z'" />
            </svg>
          </button>
          <div class="overflow-hidden transition-all duration-200 flex items-center" :class="showVolume ? 'w-20 opacity-100 ml-1' : 'w-0 opacity-0'">
            <input type="range" min="0" max="1" step="0.05" :value="isMuted ? 0 : volume" class="w-full h-1 accent-white appearance-none bg-white/30 rounded-full cursor-pointer" @input="$emit('changeVolume', Number(($event.target as HTMLInputElement).value))">
          </div>
        </div>
        <button class="w-9 h-9 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer" @click="$emit('toggleFullscreen')">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" :stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" :d="isFullscreen ? 'M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25' : 'M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15'" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

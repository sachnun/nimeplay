<script setup lang="ts">
import type { EpisodeData } from '~/utils/types'

defineProps<{
  episode: EpisodeData
  currentEpisodeNum: string
  controlsVisible: boolean
  showIframe: boolean
  showEpisodes: boolean
  qualityCount: number
  activeQualityLabel: string
}>()

defineEmits<{
  toggleEpisodes: []
  toggleQuality: []
}>()
</script>

<template>
  <div
    class="absolute top-0 left-0 right-0 z-20 px-4 md:px-8 pt-4 pb-12 bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-opacity duration-300 pointer-events-none"
    :class="controlsVisible || showIframe ? 'opacity-100' : 'opacity-0'"
  >
    <div class="flex items-center gap-3" :class="controlsVisible || showIframe ? 'pointer-events-auto' : 'pointer-events-none'">
      <NuxtLink :to="episode.animeSlug ? `/${episode.animeSlug}` : '/'" class="group/back flex items-center gap-3 min-w-0">
        <div class="flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-white/15 group-hover/back:bg-white/25 transition-colors">
          <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" :stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </div>
        <h1 class="text-sm md:text-base font-semibold text-white/90 truncate">
          {{ episode.title.replace('Subtitle Indonesia', '').trim() }}
        </h1>
      </NuxtLink>
      <div class="flex-1" />
      <button
        v-if="episode.episodeNav.length > 1"
        class="mobile-portrait-control hidden items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer"
        :class="showEpisodes ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'"
        @click="$emit('toggleEpisodes')"
      >
        EP {{ currentEpisodeNum }}
      </button>
      <button
        v-if="qualityCount > 1"
        class="mobile-portrait-control hidden text-xs px-2.5 py-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors font-medium cursor-pointer"
        @click="$emit('toggleQuality')"
      >
        {{ activeQualityLabel }}
      </button>
    </div>
  </div>
</template>

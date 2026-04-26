<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { EpisodeData } from '~/utils/types'
import { episodeNumFor } from '~/utils/player'
import { getEpisodeStatus } from '~/utils/watchHistory'

const props = defineProps<{
  episode: EpisodeData
  currentSlug: string
}>()

const currentEpRef = ref<HTMLButtonElement | null>(null)

function setCurrentEpRef(el: Element | ComponentPublicInstance | null, slug: string) {
  if (slug === props.currentSlug && el instanceof HTMLButtonElement) currentEpRef.value = el
}

onMounted(() => {
  requestAnimationFrame(() => {
    currentEpRef.value?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
})

defineEmits<{
  close: []
  navigate: [slug: string, episodeNum: string]
}>()
</script>

<template>
  <div class="absolute inset-0 z-[25] cursor-pointer" @click="$emit('close')" />
  <div class="absolute top-0 right-0 bottom-0 z-30 w-64 md:w-72 backdrop-blur-2xl bg-black/50 border-l border-white/10 flex flex-col">
    <div class="flex items-center justify-between px-4 py-3 border-b border-white/10">
      <h2 class="text-sm font-semibold text-white">Episodes</h2>
      <button class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer" @click="$emit('close')">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" :stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
    <div class="flex-1 overflow-y-auto p-3 scrollbar-thin">
      <div class="grid grid-cols-4 md:grid-cols-5 gap-2">
        <button
          v-for="(ep, i) in [...episode.episodeNav].reverse()"
          :key="ep.slug"
          :ref="(el) => setCurrentEpRef(el, ep.slug)"
          class="relative flex items-center justify-center text-sm py-2.5 rounded-lg transition-all cursor-pointer"
          :class="ep.slug === currentSlug ? 'bg-white/20 text-white ring-1 ring-white/20 font-semibold' : getEpisodeStatus(ep.slug) === 'completed' ? 'bg-white/5 text-zinc-600' : 'bg-white/5 text-zinc-300 hover:bg-white/15'"
          @click="ep.slug !== currentSlug && $emit('navigate', ep.slug, episodeNumFor(ep, i))"
        >
          {{ episodeNumFor(ep, i) }}
          <span v-if="getEpisodeStatus(ep.slug) === 'completed' && ep.slug !== currentSlug" class="absolute -top-1 -right-1 text-[8px] text-white/70">&#10003;</span>
          <span v-else-if="getEpisodeStatus(ep.slug) === 'in_progress' && ep.slug !== currentSlug" class="absolute -top-1 -right-1 text-[8px] text-white/70" aria-label="Episode sedang dilanjutkan">&#9681;</span>
        </button>
      </div>
    </div>
  </div>
</template>

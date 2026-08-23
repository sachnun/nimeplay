<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { WatchProgressStatus } from '~/utils/watchHistory'

const props = defineProps<{
  malId: number
  episodes: number[]
  currentEpisodeNumber: number
}>()

const currentEpRef = ref<HTMLButtonElement | null>(null)
const statuses = ref<Record<string, WatchProgressStatus>>({})

function setCurrentEpRef(el: Element | ComponentPublicInstance | null, number: number) {
  if (number === props.currentEpisodeNumber && el instanceof HTMLButtonElement) currentEpRef.value = el
}

async function loadStatuses() {
  const entries = await Promise.all(
    props.episodes.map(async (number) => {
      const key = progressKey(props.malId, number)
      return [key, await getEpisodeStatus(key)] as const
    }),
  )
  statuses.value = Object.fromEntries(entries)
}

onMounted(() => {
  void loadStatuses()
  requestAnimationFrame(() => {
    currentEpRef.value?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
})

function epStatus(number: number): WatchProgressStatus {
  return statuses.value[progressKey(props.malId, number)] ?? 'unstarted'
}

defineEmits<{
  close: []
  navigate: [episodeNumber: number]
}>()
</script>

<template>
  <div class="absolute inset-0 z-[25] cursor-pointer" @click="$emit('close')" />
  <div data-tv-nav-scope class="absolute top-0 right-0 bottom-0 z-30 w-64 md:w-72 backdrop-blur-2xl bg-black/50 border-l border-white/10 flex flex-col">
    <div class="flex items-center justify-between px-4 py-3 border-b border-white/10">
      <h2 class="text-sm font-semibold text-white">Episodes</h2>
      <button type="button" class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer" @click="$emit('close')">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" :stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
    <div class="flex-1 overflow-y-auto p-3 scrollbar-thin">
      <div class="grid grid-cols-4 md:grid-cols-5 gap-2">
        <button
          v-for="number in [...episodes].reverse()"
          :key="number"
          :ref="(el) => setCurrentEpRef(el, number)"
          type="button"
          class="relative flex items-center justify-center text-sm py-2.5 rounded-lg transition-all cursor-pointer"
          :class="number === currentEpisodeNumber ? 'bg-white/25 text-white font-semibold' : epStatus(number) === 'completed' ? 'bg-white/5 text-zinc-600 opacity-55' : epStatus(number) === 'in_progress' ? 'bg-white/5 text-zinc-400 opacity-75' : 'bg-white/5 text-zinc-300 hover:bg-white/15'"
          @click="number !== currentEpisodeNumber && $emit('navigate', number)"
        >
          {{ number }}
        </button>
      </div>
    </div>
  </div>
</template>

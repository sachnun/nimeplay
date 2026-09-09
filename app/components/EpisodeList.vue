<script setup lang="ts">
import type { WatchProgressStatus } from '~/utils/storage'

const props = defineProps<{
  episodes: number[]
  malId: number
  scrollable?: boolean
}>()

const episodeStatuses = ref<Record<string, WatchProgressStatus>>({})
const reversedEpisodes = computed(() => [...props.episodes].reverse())

async function refreshEpisodeStatuses() {
  episodeStatuses.value = await getEpisodeStatusMap(props.malId)
}

onMounted(() => {
  void refreshEpisodeStatuses()

  const onVisibility = () => {
    if (document.visibilityState === 'visible') void refreshEpisodeStatuses()
  }
  document.addEventListener('visibilitychange', onVisibility)
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility))
})

watch(() => props.malId, () => {
  void refreshEpisodeStatuses()
})

function episodeClass(number: number) {
  const status = episodeStatuses.value[progressKey(props.malId, number)] ?? 'unstarted'
  if (status === 'completed') return 'bg-white/10 text-white/35 opacity-50'
  if (status === 'in_progress') return 'bg-white/10 text-white/50 opacity-75'
  return 'bg-white/15 text-white hover:bg-white/25 active:bg-white/25'
}

</script>

<template>
  <p v-if="episodes.length === 0" class="text-zinc-500 text-sm">No episodes available yet.</p>
  <div v-else :class="scrollable ? 'max-h-[320px] overflow-y-auto pr-1 scrollbar-thin' : ''">
    <div class="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2 [content-visibility:auto] [contain-intrinsic-size:auto_200px]">
      <NuxtLink
        v-for="number in reversedEpisodes"
        :key="number"
        :to="`/anime/${malId}/${number}`"
        class="relative text-sm py-2 rounded text-center transition-colors"
        :class="episodeClass(number)"
      >
        {{ number }}
      </NuxtLink>
    </div>
  </div>
</template>

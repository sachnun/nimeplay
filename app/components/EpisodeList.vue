<script setup lang="ts">
import type { WatchProgressStatus } from '~/utils/watchHistory'

const props = defineProps<{
  episodes: number[]
  malId: number
  scrollable?: boolean
}>()

const episodeStatuses = ref<Record<string, WatchProgressStatus>>({})

async function refreshEpisodeStatuses() {
  const entries = await Promise.all(
    props.episodes.map(async (number) => {
      const key = progressKey(props.malId, number)
      return [key, await getEpisodeStatus(key)] as const
    }),
  )
  episodeStatuses.value = Object.fromEntries(entries)
}

onMounted(() => {
  void refreshEpisodeStatuses()

  const onVisibility = () => {
    if (document.visibilityState === 'visible') refreshEpisodeStatuses()
  }
  document.addEventListener('visibilitychange', onVisibility)
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility))
})

function episodeStatus(number: number) {
  return episodeStatuses.value[progressKey(props.malId, number)] ?? 'unstarted'
}

</script>

<template>
  <p v-if="episodes.length === 0" class="text-zinc-500 text-sm">No episodes available yet.</p>
  <div v-else :class="scrollable ? 'max-h-[320px] overflow-y-auto pr-1 scrollbar-thin' : ''">
    <div class="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2">
      <NuxtLink
        v-for="number in [...episodes].reverse()"
        :key="number"
        :to="`/anime/${malId}/${number}`"
        class="relative text-sm py-2 rounded text-center backdrop-blur transition-colors"
        :class="episodeStatus(number) === 'completed' ? 'bg-white/10 text-white/35 opacity-50' : episodeStatus(number) === 'in_progress' ? 'bg-white/10 text-white/50 opacity-75' : 'bg-white/15 text-white hover:bg-white/25 active:bg-white/25'"
      >
        {{ number }}
      </NuxtLink>
    </div>
  </div>
</template>

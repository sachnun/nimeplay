<script setup lang="ts">
import { getEpisodeStatus } from '~/utils/watchHistory'

defineProps<{
  episodes: { title: string; slug: string }[]
  animeSlug: string
  scrollable?: boolean
}>()

const refreshKey = ref(0)

onMounted(() => {
  const onVisibility = () => {
    if (document.visibilityState === 'visible') refreshKey.value++
  }
  document.addEventListener('visibilitychange', onVisibility)
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility))
})

function episodeNumber(ep: { title: string }, index: number) {
  return ep.title.match(/episode\s*(\d+)/i)?.[1] ?? `${index + 1}`
}
</script>

<template>
  <p v-if="episodes.length === 0" class="text-zinc-500 text-sm">No episodes available yet.</p>
  <div v-else :class="scrollable ? 'max-h-[320px] overflow-y-auto pr-1 scrollbar-thin' : ''">
    <div :key="refreshKey" class="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2">
      <NuxtLink
        v-for="(ep, i) in [...episodes].reverse()"
        :key="ep.slug"
        :to="`/${animeSlug}/${episodeNumber(ep, i)}`"
        class="relative text-sm py-2 rounded text-center backdrop-blur transition-colors"
        :class="getEpisodeStatus(ep.slug) === 'completed' ? 'bg-white/10 text-white/35 opacity-50' : 'bg-white/15 text-white hover:bg-white/25 active:bg-white/25'"
      >
        {{ episodeNumber(ep, i) }}
      </NuxtLink>
    </div>
  </div>
</template>

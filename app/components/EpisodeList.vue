<script setup lang="ts">
import { getEpisodeStatus, type WatchProgressStatus } from '~/utils/watchHistory'

const props = defineProps<{
  episodes: { title: string; slug: string }[]
  animeSlug: string
  scrollable?: boolean
}>()

const episodeStatuses = ref<Record<string, WatchProgressStatus>>({})

function refreshEpisodeStatuses() {
  episodeStatuses.value = Object.fromEntries(
    props.episodes.map((ep) => [ep.slug, getEpisodeStatus(ep.slug)]),
  )
}

onMounted(() => {
  refreshEpisodeStatuses()

  const onVisibility = () => {
    if (document.visibilityState === 'visible') refreshEpisodeStatuses()
  }
  document.addEventListener('visibilitychange', onVisibility)
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility))
})

function episodeStatus(slug: string) {
  return episodeStatuses.value[slug] ?? 'unstarted'
}

function episodeNumber(ep: { title: string }, index: number) {
  return ep.title.match(/episode\s*(\d+)/i)?.[1] ?? `${index + 1}`
}
</script>

<template>
  <p v-if="episodes.length === 0" class="text-zinc-500 text-sm">No episodes available yet.</p>
  <div v-else :class="scrollable ? 'max-h-[320px] overflow-y-auto pr-1 scrollbar-thin' : ''">
    <div class="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2">
      <NuxtLink
        v-for="(ep, i) in [...episodes].reverse()"
        :key="ep.slug"
        :to="`/${animeSlug}/${episodeNumber(ep, i)}`"
        class="relative text-sm py-2 rounded text-center backdrop-blur transition-colors"
        :class="episodeStatus(ep.slug) === 'completed' ? 'bg-white/10 text-white/35 opacity-50' : 'bg-white/15 text-white hover:bg-white/25 active:bg-white/25'"
      >
        {{ episodeNumber(ep, i) }}
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EpisodePageData } from '~/utils/types'

const route = useRoute()
const malId = computed(() => Number(route.params.malId) || 0)
const episodeParam = computed(() => String(route.params.episode || ''))

const { data: pageData, pending } = await useAsyncData<EpisodePageData | null>(
  () => `episode-page-${malId.value}-${episodeParam.value}`,
  async () => {
    try {
      return await $fetch<EpisodePageData>(`/api/anime/${malId.value}/${episodeParam.value}`)
    } catch {
      return null
    }
  },
  {
    watch: [malId, episodeParam],
    default: () => null,
    server: false,
    getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key],
  },
)

const anime = computed(() => pageData.value?.anime ?? null)
const episodeData = computed(() => pageData.value?.episode ?? null)

watchEffect(() => {
  if (!import.meta.client || pending.value) return
  if (!anime.value) navigateTo('/')
  else if (!episodeData.value) navigateTo(`/anime/${malId.value}`)
})

useSeoMeta({
  title: () => pageData.value?.episode.title ?? 'Nimeplay',
  ogTitle: () => pageData.value?.episode.title ?? 'Nimeplay',
  ogImage: () => pageData.value?.anime.thumbnail || '/favicon.svg',
})
</script>

<template>
  <PlayerLoadingShell v-if="pending || !pageData || !episodeData" />
  <ClientOnly v-else>
    <EpisodePlayer
      :key="`${malId}-${episodeParam}`"
      :mal-id="malId"
      :episode-number="Number(episodeParam) || pageData!.episodeNumber"
      :episode="episodeData!"
      :episodes="pageData!.episodes"
      :anime-title="anime?.title || ''"
      :anime-thumbnail="anime?.thumbnail || ''"
    />
    <template #fallback>
      <PlayerLoadingShell />
    </template>
  </ClientOnly>
</template>

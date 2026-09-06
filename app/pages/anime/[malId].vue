<script setup lang="ts">
import type { AnimeDetail } from '~/utils/types'

const route = useRoute()
const malId = computed(() => Number(route.params.malId) || 0)
const isEpisodeRoute = computed(() => Boolean(route.params.episode))

const { data: anime, pending } = await useAsyncData<AnimeDetail | null>(
  () => `anime-detail-${malId.value}`,
  () => $fetch(`/api/anime/${malId.value}`),
  {
    watch: [malId, isEpisodeRoute],
    getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key],
  },
)

if (!isEpisodeRoute.value && !anime.value) {
  await navigateTo('/')
}

watchEffect(() => {
  if (!isEpisodeRoute.value && !pending.value && !anime.value) navigateTo('/')
})

useSeoMeta({
  title: () => anime.value?.title ?? 'Nimeplay',
  description: () => anime.value?.synopsis?.slice(0, 160) || 'Minimal anime streaming',
  ogTitle: () => anime.value?.title ?? 'Nimeplay',
  ogDescription: () => anime.value?.synopsis?.slice(0, 160) || 'Minimal anime streaming',
  ogImage: () => anime.value?.thumbnail || '/favicon.svg',
})
</script>

<template>
  <NuxtPage v-if="isEpisodeRoute" />
  <AnimeDetailContent
    v-else-if="anime"
    :mal-id="anime.malId"
    :title="anime.title"
    :japanese-title="anime.japanese || undefined"
    :thumbnail="anime.thumbnail"
    :genres="anime.genres"
    :synopsis-id="anime.synopsis || undefined"
    :otakudesu="{
      score: anime.score,
      status: anime.status,
      type: anime.type,
      duration: anime.duration,
      studio: anime.studio,
      source: anime.source,
      releaseDate: anime.releaseDate,
    }"
    :episodes="anime.episodes.map(entry => entry.number)"
  />
</template>

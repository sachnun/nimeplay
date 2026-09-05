<script setup lang="ts">
import type { AnimeDetail } from '~/utils/types'

const route = useRoute()
const malId = computed(() => Number(route.params.malId) || 0)
const isEpisodeRoute = computed(() => Boolean(route.params.episode))

const { data: anime, pending } = await useAsyncData<AnimeDetail | null>(
  () => `anime-detail-${malId.value}`,
  () => $fetch(`/api/anime/${malId.value}`),
  { watch: [malId, isEpisodeRoute] },
)

if (!isEpisodeRoute.value && !anime.value) {
  await navigateTo('/')
}

watchEffect(() => {
  if (!isEpisodeRoute.value && !pending.value && !anime.value) navigateTo('/')
  if (anime.value?.title) useHead({ title: anime.value.title })
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

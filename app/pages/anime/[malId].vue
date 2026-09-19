<script setup lang="ts">
import type { AnimeDetail } from '~/utils/types'

const route = useRoute()
const malId = computed(() => Number(route.params.malId) || 0)
const isEpisodeRoute = computed(() => Boolean(route.params.episode))

const { data: anime, pending, error } = await useAsyncData<AnimeDetail | null>(
  () => `anime-detail-${malId.value}`,
  () => $fetch(`/api/anime/${malId.value}`),
  { watch: [malId, isEpisodeRoute] },
)

const showPlane = computed(() => !isEpisodeRoute.value && !pending.value && !anime.value && isServerError(error.value))

if (!isEpisodeRoute.value && !anime.value && !isServerError(error.value)) {
  await navigateTo('/')
}

watchEffect(() => {
  if (!isEpisodeRoute.value && !pending.value && !anime.value && !showPlane.value) navigateTo('/')
  if (anime.value?.title) useHead({ title: anime.value.title })
})
</script>

<template>
  <NuxtPage v-if="isEpisodeRoute" />
  <EmptyState v-else-if="showPlane" />
  <div v-else-if="anime" class="grid min-h-dvh">
    <AnimeDetailContent :anime="anime" />
  </div>
</template>

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
  },
)

const anime = computed(() => pageData.value?.anime ?? null)
const episodeData = computed(() => pageData.value?.episode ?? null)

if (!anime.value) {
  await navigateTo('/')
}
else if (!episodeData.value) {
  await navigateTo(`/anime/${malId.value}`)
}

watchEffect(() => {
  if (!pending.value && !anime.value) navigateTo('/')
  else if (!pending.value && !episodeData.value) navigateTo(`/anime/${malId.value}`)
  if (pageData.value?.episode.title) useHead({ title: pageData.value.episode.title })
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

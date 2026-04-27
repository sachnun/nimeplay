<script setup lang="ts">
import type { EpisodeData } from '~/utils/types'

const route = useRoute()
const slug = computed(() => String(route.params.slug || ''))
const episodeParam = computed(() => String(route.params.episode || ''))

interface EpisodePageData {
  anime: { thumbnail: string } | null
  episodeSlug: string | null
  episode: EpisodeData | null
}

const { data: pageData, pending } = await useAsyncData<EpisodePageData>(
  () => `episode-page-${slug.value}-${episodeParam.value}`,
  async () => {
    return useTrpc().episodePage.query({ animeSlug: slug.value, episode: episodeParam.value })
  },
  {
    watch: [slug, episodeParam],
    default: () => ({ anime: null, episodeSlug: null, episode: null }),
  },
)

const anime = computed(() => pageData.value.anime)
const episodeSlug = computed(() => pageData.value.episodeSlug)
const episodeData = computed(() => pageData.value.episode)

if (!anime.value) {
  await navigateTo('/')
}
else if (!episodeSlug.value || !episodeData.value) {
  await navigateTo(`/${slug.value}`)
}

watchEffect(() => {
  if (!pending.value && !anime.value) navigateTo('/')
  else if (!pending.value && (!episodeSlug.value || !episodeData.value)) navigateTo(`/${slug.value}`)
  if (episodeData.value?.title) useHead({ title: episodeData.value.title })
})
</script>

<template>
  <PlayerLoadingShell v-if="pending || !episodeData || !episodeSlug" />
  <ClientOnly v-else>
    <EpisodePlayer
      :key="episodeSlug"
      :episode="episodeData"
      :current-slug="episodeSlug"
      :anime-slug="slug"
      :anime-thumbnail="anime?.thumbnail || ''"
      :current-episode-num="episodeParam"
    />
    <template #fallback>
      <PlayerLoadingShell />
    </template>
  </ClientOnly>
</template>

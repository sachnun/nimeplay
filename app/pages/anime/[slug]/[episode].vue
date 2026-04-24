<script setup lang="ts">
import { ANIME_QUERY, EPISODE_QUERY } from '~/graphql/operations'
import type { AnimeDetail, EpisodeData } from '~/utils/types'

const route = useRoute()
const slug = computed(() => String(route.params.slug || ''))
const episodeParam = computed(() => String(route.params.episode || ''))

const { data: anime } = await useAsyncData<AnimeDetail | null>(
  () => `anime-${slug.value}`,
  async () => {
    const result = await graphqlQuery<{ anime: AnimeDetail | null }, { slug: string }>(ANIME_QUERY, { slug: slug.value })
    return result.anime
  },
  { watch: [slug] },
)

const episodeSlug = computed(() => {
  if (!anime.value?.episodes || !episodeParam.value) return null
  const reversed = [...anime.value.episodes].reverse()
  for (let i = 0; i < reversed.length; i++) {
    const match = reversed[i].title.match(/episode\s*(\d+)/i)
    const num = match ? match[1] : `${i + 1}`
    if (num === episodeParam.value) return reversed[i].slug
  }
  return null
})

const { data: episodeData, pending } = await useAsyncData<EpisodeData | null>(
  () => episodeSlug.value ? `episode-data-${episodeSlug.value}` : 'episode-data-none',
  async () => {
    if (!episodeSlug.value) return null
    const result = await graphqlQuery<{ episode: EpisodeData | null }, { slug: string }>(EPISODE_QUERY, { slug: episodeSlug.value })
    return result.episode
  },
  { watch: [episodeSlug] },
)

watchEffect(() => {
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

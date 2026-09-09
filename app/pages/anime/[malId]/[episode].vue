<script setup lang="ts">
import { preloadHls } from '~/utils/hls'
import type { EpisodePageData } from '~/utils/types'

const route = useRoute()
const router = useRouter()
const malId = computed(() => Number(route.params.malId) || 0)
const episodeParam = computed(() => String(route.params.episode || ''))

const { data: pageData, pending } = useAsyncData<EpisodePageData | null>(
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
const initialSource = computed(() => pageData.value?.initialSource ?? null)

watchEffect(() => {
  if (pending.value) return
  if (!anime.value) router.replace('/')
  else if (!episodeData.value) router.replace(`/anime/${malId.value}`)
  if (pageData.value?.episode.title) useHead({ title: pageData.value.episode.title })
})

onMounted(() => {
  preloadHls()
})
</script>

<template>
  <PlayerLoadingShell v-if="pending || !pageData || !episodeData" />
  <EpisodePlayer
    v-else
    :key="`${malId}-${episodeParam}`"
    :mal-id="malId"
    :episode-number="Number(episodeParam) || pageData!.episodeNumber"
    :episode="episodeData!"
    :episodes="pageData!.episodes"
    :anime-title="anime?.title || ''"
    :anime-thumbnail="anime?.thumbnail || ''"
    :initial-source="initialSource"
  />
</template>

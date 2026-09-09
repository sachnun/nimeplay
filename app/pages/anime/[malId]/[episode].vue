<script setup lang="ts">
import { preloadHls } from '~/utils/hls'
import type { EpisodeMetaData, EpisodePageData } from '~/utils/types'

const route = useRoute()
const router = useRouter()
const malId = computed(() => Number(route.params.malId) || 0)
const episodeParam = computed(() => String(route.params.episode || ''))

const { data: metaData } = await useAsyncData<EpisodeMetaData | null>(
  () => `episode-meta-${malId.value}-${episodeParam.value}`,
  async () => {
    try {
      return await $fetch<EpisodeMetaData>(`/api/anime/${malId.value}/${episodeParam.value}/meta`)
    } catch {
      return null
    }
  },
  {
    watch: [malId, episodeParam],
    default: () => null,
  },
)

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

const anime = computed(() => pageData.value?.anime ?? metaData.value?.anime ?? null)
const episodeData = computed(() => pageData.value?.episode ?? null)
const initialSource = computed(() => pageData.value?.initialSource ?? null)
const headerTitle = computed(() => pageData.value?.episode.title || metaData.value?.episodeTitle || '')
const pendingEpisodeNum = computed(() => Number(episodeParam.value) || metaData.value?.episodeNumber || 0)
const pendingPrev = computed(() => {
  const list = metaData.value?.episodes ?? []
  const idx = list.indexOf(pendingEpisodeNum.value)
  return idx > 0 ? { num: list[idx - 1]! } : null
})
const pendingNext = computed(() => {
  const list = metaData.value?.episodes ?? []
  const idx = list.indexOf(pendingEpisodeNum.value)
  return idx !== -1 && idx < list.length - 1 ? { num: list[idx + 1]! } : null
})

function pendingNavigate(epNum: number) {
  router.replace(`/anime/${malId.value}/${epNum}`)
}

watchEffect(() => {
  if (pending.value) return
  if (!pageData.value && !metaData.value) router.replace('/')
  else if (!pageData.value) router.replace(`/anime/${malId.value}`)
  if (headerTitle.value) useHead({ title: headerTitle.value })
})

onMounted(() => {
  preloadHls()
})
</script>

<template>
  <div v-if="pending || !pageData || !episodeData" class="fixed inset-0 bg-black z-50">
    <PlayerLoadingShell class-name="absolute inset-0 bg-black" :title="headerTitle" :mal-id="malId" :controls-skeleton="false" />
    <PlayerBottomControls
      :current-episode-num="pendingEpisodeNum"
      :disabled="true"
      :episode-count="metaData?.episodes.length || 0"
      :next-episode="pendingNext"
      :prev-episode="pendingPrev"
      @navigate="pendingNavigate"
    />
  </div>
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

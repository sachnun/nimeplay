<script setup lang="ts">
import type { TrpcOutputs } from '~/types/trpc'
import type { ContinueItem } from '~/utils/types'
import { getContinueWatching, getProgressStatus } from '~/utils/watchHistory'

type HomeData = TrpcOutputs['home']

withDefaults(defineProps<{
  ongoingData: HomeData['ongoingData']
  completedData: HomeData['completedData']
  genres: HomeData['genres']
  isLoading?: boolean
}>(), {
  isLoading: false,
})

const searchOpen = ref(false)
const { selectedGenre, setSelectedGenre } = useGenre()
const trpc = useTrpc()
const initialContinueItems = import.meta.client ? getContinueWatching().slice(0, 3) : []
const continueItems = ref<ContinueItem[]>([])
const continueLoading = ref(false)
const continueCount = ref(initialContinueItems.length)

async function fetchContinueWatching() {
  const items = initialContinueItems.length > 0 && continueItems.value.length === 0
    ? initialContinueItems
    : getContinueWatching().slice(0, 3)
  continueCount.value = items.length
  if (items.length === 0) {
    continueItems.value = []
    return
  }

  continueLoading.value = true
  try {
    const result = await trpc.animeDetails.query({ slugs: items.map((item) => item.animeSlug) })
    const details = new Map(result.map((item) => [item.slug, item.anime]))
    const results = items.map((p) => {
      const detail = details.get(p.animeSlug)
      if (!detail) return null
      const newestEpisode = detail.episodes[0]
      const latestEp = detail.episodes.length > 0
        ? newestEpisode?.title.match(/episode\s*(\d+)/i)?.[1] ?? `${detail.episodes.length}`
        : p.episodeNum
      let episodeNum = p.episodeNum
      let episodeSlug = p.episodeSlug
      let currentTime = p.currentTime
      let duration = p.duration
      if (getProgressStatus(p) === 'completed' && detail.episodes.length > 0) {
        const ascending = [...detail.episodes].reverse()
        const currentIdx = ascending.findIndex((ep) => ep.slug === p.episodeSlug)
        if (currentIdx !== -1 && currentIdx + 1 < ascending.length) {
          const nextEp = ascending[currentIdx + 1]
          if (!nextEp) return null
          episodeNum = nextEp.title.match(/episode\s*(\d+)/i)?.[1] ?? `${currentIdx + 2}`
          episodeSlug = nextEp.slug
          currentTime = 0
          duration = 1
        } else return null
      }
      return { animeSlug: p.animeSlug, episodeNum, episodeSlug, currentTime, duration, title: detail.title, thumbnail: detail.thumbnail, latestEpisode: latestEp } satisfies ContinueItem
    })
    continueItems.value = results.filter((item): item is ContinueItem => item !== null)
  } catch {
    continueItems.value = []
  } finally {
    continueLoading.value = false
  }
}

onMounted(() => {
  void fetchContinueWatching()
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') return
    void fetchContinueWatching()
  }
  document.addEventListener('visibilitychange', onVisibility)
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility))
})
</script>

<template>
  <GenreFilter :genres="genres" :selected-genre="selectedGenre" @select="setSelectedGenre" @search="searchOpen = true" />

  <section v-if="isLoading">
    <div class="grid grid-cols-2 sm:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] gap-4">
      <div v-for="i in 18" :key="i" class="rounded-lg overflow-hidden bg-card animate-pulse">
        <div class="relative aspect-[3/4] bg-zinc-900">
          <div class="absolute bottom-0 left-0 right-0 p-3">
            <div class="h-4 w-3/4 bg-white/10 rounded mb-2" />
            <div class="h-3 w-1/2 bg-white/10 rounded" />
          </div>
        </div>
      </div>
    </div>
  </section>
  <section v-else-if="selectedGenre">
    <GenreAnimeGrid :key="selectedGenre.slug" :genre-slug="selectedGenre.slug" :continue-items="continueItems" />
  </section>
  <section v-else>
    <AnimeInfiniteGrid
      page-type="ONGOING"
      :initial-data="ongoingData"
      next-page-type="COMPLETED"
      :next-initial-data="completedData"
      :next-show-day="false"
      :continue-items="continueItems"
      :continue-count="continueLoading ? continueCount : 0"
    />
  </section>

  <SearchBar :open="searchOpen" @close="searchOpen = false" />
</template>

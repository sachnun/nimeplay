<script setup lang="ts">
import type { AnimeCard, Genre, ContinueItem } from '~/utils/types'
import type { WatchProgress } from '~/utils/watchHistory'

type ContinueProgress = WatchProgress

withDefaults(defineProps<{
  ongoingData: { anime: AnimeCard[]; totalPages: number }
  completedData: { anime: AnimeCard[]; totalPages: number }
  genres: Genre[]
  isLoading?: boolean
}>(), {
  isLoading: false,
})

const selectedGenre = useState<Genre | null>('selected-genre', () => null)
const searchOpen = ref(false)
const initialContinueItems = ref<WatchProgress[]>([])
const continueItems = ref<ContinueItem[]>([])
const continueLoading = ref(false)
const continueCount = ref(0)

interface ContinueDetail {
  malId: number
  title: string
  thumbnail: string
  latestEpisode: string
}

function toContinueItem(p: ContinueProgress, detail: ContinueDetail): ContinueItem | null {
  return { malId: p.malId, title: detail.title, thumbnail: detail.thumbnail, episodeNum: String(p.episodeNumber), episodeNumber: p.episodeNumber, currentTime: p.currentTime, duration: p.duration, latestEpisode: detail.latestEpisode }
}

async function fetchContinueWatching() {
  const all = await getContinueWatching()
  const items = initialContinueItems.value.length > 0 && continueItems.value.length === 0
    ? initialContinueItems.value
    : all.slice(0, 3)
  continueCount.value = items.length
  if (items.length === 0) {
    continueItems.value = []
    return
  }

  continueLoading.value = true
  try {
    const malIds = items.map((item) => item.malId)
    const fetched = await $fetch<ContinueDetail[]>('/api/anime/details', {
      method: 'POST',
      body: { malIds },
    })
    const details = new Map(fetched.map((item) => [item.malId, item] as const))
    continueItems.value = items.map((p) => {
      const detail = details.get(p.malId)
      if (!detail) return null
      return toContinueItem(p, detail)
    }).filter((item): item is ContinueItem => item !== null)
  } catch {
    continueItems.value = []
  } finally {
    continueLoading.value = false
  }
}

onMounted(() => {
  if (import.meta.client) {
    getContinueWatching().then((all) => {
      initialContinueItems.value = all.slice(0, 3)
      continueCount.value = initialContinueItems.value.length
    })
  }
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
  <GenreFilter :genres="genres" :selected-genre="selectedGenre" @select="selectedGenre = $event" @search="searchOpen = true" @sign-in="searchOpen = false" />

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

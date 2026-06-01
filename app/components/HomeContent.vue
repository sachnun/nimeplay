<script setup lang="ts">
import type { AnimeCard, AnimeDetail, Genre, ContinueItem } from '~/utils/types'
import { getContinueWatching, getProgressStatus } from '~/utils/watchHistory'
import type { WatchProgress } from '~/utils/watchHistory'
import { getFreshAnimeDetail, setAnimeDetail, TTL } from '~/utils/apiCache'

type ContinueProgress = WatchProgress
type ContinueEpisode = Pick<ContinueItem, 'episodeNum' | 'episodeSlug' | 'currentTime' | 'duration' | 'latestEpisode'>

withDefaults(defineProps<{
  ongoingData: { anime: AnimeCard[]; totalPages: number }
  completedData: { anime: AnimeCard[]; totalPages: number }
  genres: Genre[]
  isLoading?: boolean
}>(), {
  isLoading: false,
})

const selectedGenre = useState<Genre | null>('selected-genre')
const searchOpen = ref(false)
const initialContinueItems = ref<WatchProgress[]>([])
const continueItems = ref<ContinueItem[]>([])
const continueLoading = ref(false)
const continueCount = ref(0)

function episodeNumberFromTitle(title: string, fallback: string | number) {
  return title.match(/episode\s*(\d+)/i)?.[1] ?? `${fallback}`
}

function latestEpisodeNumber(detail: AnimeDetail, fallback: string) {
  return episodeNumberFromTitle(detail.episodes[0]?.title ?? '', detail.episodes.length || fallback)
}

function currentContinueEpisode(p: ContinueProgress, latestEpisode: string): ContinueEpisode {
  return { episodeNum: p.episodeNum, episodeSlug: p.episodeSlug, currentTime: p.currentTime, duration: p.duration, latestEpisode }
}

function nextEpisodeAfterCompleted(p: ContinueProgress, detail: AnimeDetail, latestEpisode: string): ContinueEpisode | null {
  const ascending = [...detail.episodes].reverse()
  const currentIdx = ascending.findIndex((ep) => ep.slug === p.episodeSlug)
  const nextEp = currentIdx === -1 ? null : ascending[currentIdx + 1]
  return nextEp ? {
    episodeNum: episodeNumberFromTitle(nextEp.title, currentIdx + 2),
    episodeSlug: nextEp.slug,
    currentTime: 0,
    duration: 1,
    latestEpisode,
  } : null
}

async function nextContinueEpisode(p: ContinueProgress, detail: AnimeDetail): Promise<ContinueEpisode | null> {
  const latest = latestEpisodeNumber(detail, p.episodeNum)
  return (await getProgressStatus(p)) !== 'completed'
    ? currentContinueEpisode(p, latest)
    : nextEpisodeAfterCompleted(p, detail, latest)
}

function toContinueItem(p: ContinueProgress, detail: AnimeDetail): ContinueItem | null {
  return { animeSlug: p.animeSlug, title: detail.title, thumbnail: detail.thumbnail, episodeNum: p.episodeNum, episodeSlug: p.episodeSlug, currentTime: p.currentTime, duration: p.duration, latestEpisode: p.episodeNum }
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
    const slugs = items.map((item) => item.animeSlug)
    const cachedEntries = await Promise.all(slugs.map(async (s) => [s, await getFreshAnimeDetail(s)] as const))
    const missing = cachedEntries.filter(([, v]) => !v).map(([s]) => s)
    let details: Map<string, typeof cachedEntries[number][1]>
    if (missing.length === 0) {
      details = new Map(cachedEntries)
    } else {
      const fetched = await $fetch<{ slug: string; anime: AnimeDetail | null }[]>('/api/anime/details', {
        method: 'POST',
        body: { slugs: missing },
      })
      if (import.meta.client) {
        await Promise.all(fetched.map(async (item) => {
          if (item.anime) await setAnimeDetail(item.slug, item.anime)
        }))
      }
      details = new Map([...cachedEntries, ...fetched.map((item) => [item.slug, item.anime] as const)])
    }
    continueItems.value = items.map((p) => {
      const detail = details.get(p.animeSlug)
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

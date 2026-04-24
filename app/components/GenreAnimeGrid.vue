<script setup lang="ts">
import { GENRE_PAGE_QUERY } from '~/graphql/operations'
import type { ContinueItem, GenreAnimeCard } from '~/utils/types'
import { getContinueWatching } from '~/utils/watchHistory'

interface PageData {
  anime: GenreAnimeCard[]
  totalPages: number
}

interface ProgressEntry {
  animeSlug: string
  episodeNum: string
  episodeSlug: string
  currentTime: number
  duration: number
}

const props = withDefaults(defineProps<{
  genreSlug: string
  continueItems?: ContinueItem[]
}>(), {
  continueItems: () => [],
})

const sentinelRef = ref<HTMLDivElement | null>(null)
const gridRef = ref<HTMLDivElement | null>(null)
const cols = ref(2)
const pages = ref<PageData[]>([])
const size = ref(0)
const loading = ref(false)
const allProgress = ref<ProgressEntry[]>([])

const allAnime = computed(() => pages.value.flatMap((d) => d.anime))
const totalPages = computed(() => pages.value[0]?.totalPages ?? 1)
const isEnd = computed(() => size.value >= totalPages.value)
const progressMap = computed(() => {
  const map = new Map<string, ProgressEntry>()
  for (const item of allProgress.value) map.set(item.animeSlug, item)
  for (const item of props.continueItems) map.set(item.animeSlug, item)
  return map
})
const animeCards = computed(() => allAnime.value.map((anime) => {
  const progress = progressMap.value.get(anime.slug)
  return {
    anime,
    progress,
    to: progress ? `/anime/${anime.slug}/${progress.episodeNum}` : `/anime/${anime.slug}`,
  }
}))
const skeletonCount = computed(() => Math.max((cols.value - allAnime.value.length % cols.value) % cols.value + cols.value * 3, 18))

async function loadPage(page: number) {
  const result = await graphqlQuery<{ genre: PageData }, { slug: string; page: number }>(
    GENRE_PAGE_QUERY,
    { slug: props.genreSlug, page },
  )
  return result.genre
}

async function loadMore() {
  if (loading.value || isEnd.value) return
  loading.value = true
  try {
    const next = size.value + 1
    pages.value.push(await loadPage(next))
    size.value = next
  } finally {
    loading.value = false
  }
}

async function reset() {
  pages.value = []
  size.value = 0
  await loadMore()
}

watch(() => props.genreSlug, () => { void reset() }, { immediate: true })

function syncProgress() {
  const all = getContinueWatching()
  allProgress.value = all.length > 0 ? all : props.continueItems
}

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  syncProgress()
  window.addEventListener('storage', syncProgress)
  const onVisibility = () => {
    if (document.visibilityState === 'visible') syncProgress()
  }
  document.addEventListener('visibilitychange', onVisibility)

  if (gridRef.value) {
    const update = () => {
      if (!gridRef.value) return
      cols.value = getComputedStyle(gridRef.value).gridTemplateColumns.split(' ').length
    }
    update()
    resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(gridRef.value)
  }

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) void loadMore()
  }, { rootMargin: '800px 0px' })
  if (sentinelRef.value) observer.observe(sentinelRef.value)

  onBeforeUnmount(() => {
    window.removeEventListener('storage', syncProgress)
    document.removeEventListener('visibilitychange', onVisibility)
    observer.disconnect()
    resizeObserver?.disconnect()
  })
})
</script>

<template>
  <div>
    <div ref="gridRef" class="grid grid-cols-2 sm:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] gap-4">
      <NuxtLink
        v-for="({ anime, progress, to }, i) in animeCards"
        :key="`${anime.slug}-${i}`"
        :to="to"
        class="anime-card block rounded-lg overflow-hidden bg-card relative"
      >
        <div class="relative aspect-[3/4]">
          <NuxtImg :src="anime.thumbnail" :alt="anime.title" width="300" height="400" format="webp" :loading="i < 6 ? 'eager' : 'lazy'" sizes="sm:200px md:220px lg:240px" class="object-cover w-full h-full" />
          <div v-if="anime.episodes && /\d/.test(anime.episodes)" class="absolute top-2 right-2 bg-zinc-700 text-zinc-200 text-xs px-2 py-0.5 rounded font-medium">
            {{ anime.episodes }}
          </div>
          <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-8" :class="progress ? 'pb-5 !pt-12' : ''">
            <p class="text-sm font-semibold text-white leading-tight line-clamp-2">{{ anime.title }}</p>
            <p v-if="progress" class="text-xs text-zinc-400 mt-1">Lanjutkan EP {{ progress.episodeNum }}</p>
            <p v-else class="text-xs text-zinc-400 mt-1">{{ anime.date }}</p>
          </div>
          <div v-if="progress && progress.duration > 0" class="absolute bottom-2 left-2 right-2 h-[3px] bg-white/20 rounded-full overflow-hidden">
            <div class="h-full bg-white rounded-full" :style="{ width: `${(progress.currentTime / progress.duration) * 100}%` }" />
          </div>
        </div>
      </NuxtLink>

      <div v-for="i in loading ? skeletonCount : 0" :key="`skeleton-${i}`" class="rounded-lg overflow-hidden bg-card animate-pulse">
        <div class="relative aspect-[3/4] bg-zinc-900">
          <div class="absolute bottom-0 left-0 right-0 p-3">
            <div class="h-4 w-3/4 bg-white/10 rounded mb-2" />
            <div class="h-3 w-1/2 bg-white/10 rounded" />
          </div>
        </div>
      </div>
    </div>
    <div ref="sentinelRef" class="py-4">
      <p v-if="isEnd && allAnime.length > 0" class="text-sm text-zinc-600 text-center">No more anime to load</p>
    </div>
  </div>
</template>

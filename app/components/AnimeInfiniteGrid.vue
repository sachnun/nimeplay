<script setup lang="ts">
import type { AnimeCard, ContinueItem } from '~/utils/types'
import { getContinueWatching } from '~/utils/watchHistory'

interface PageData {
  anime: AnimeCard[]
  totalPages: number
}

const props = withDefaults(defineProps<{
  apiUrl: string
  initialData: PageData
  showDay?: boolean
  nextApiUrl?: string
  nextInitialData?: PageData
  nextShowDay?: boolean
  continueItems?: ContinueItem[]
  continueCount?: number
}>(), {
  showDay: true,
  nextApiUrl: undefined,
  nextInitialData: undefined,
  nextShowDay: false,
  continueItems: () => [],
  continueCount: 0,
})

interface ProgressEntry { animeSlug: string; episodeNum: string; episodeSlug: string; currentTime: number; duration: number }

const sentinelRef = ref<HTMLDivElement | null>(null)
const gridRef = ref<HTMLDivElement | null>(null)
const cols = ref(2)
const gridState = useState<{
  primaryPages: PageData[]
  nextPages: PageData[]
  primarySize: number
  nextSize: number
}>(`anime-grid:${props.apiUrl}:${props.nextApiUrl ?? ''}`, () => ({
  primaryPages: [props.initialData],
  nextPages: [],
  primarySize: 1,
  nextSize: 0,
}))
const loading = ref(false)
const allProgress = ref<ProgressEntry[]>([])

onMounted(() => {
  const all = getContinueWatching()
  allProgress.value = all.length > 0 ? all : props.continueItems
})

watch(() => props.initialData, (data) => {
  if (gridState.value.primaryPages[0]?.anime.length) return
  gridState.value.primaryPages = [data]
  gridState.value.primarySize = 1
  gridState.value.nextPages = []
  gridState.value.nextSize = 0
})

const primaryAnime = computed(() => gridState.value.primaryPages.flatMap((d) => d.anime))
const totalPages = computed(() => gridState.value.primaryPages[0]?.totalPages ?? 1)
const primaryEnd = computed(() => gridState.value.primarySize >= totalPages.value)
const nextAnime = computed(() => primaryEnd.value ? gridState.value.nextPages.flatMap((d) => d.anime) : [])
const nextTotalPages = computed(() => gridState.value.nextPages[0]?.totalPages ?? 1)
const nextEnd = computed(() => !props.nextApiUrl || (primaryEnd.value && gridState.value.nextSize >= nextTotalPages.value))
const isEnd = computed(() => primaryEnd.value && nextEnd.value)

const progressMap = computed(() => {
  const map = new Map<string, ProgressEntry>()
  for (const item of allProgress.value) map.set(item.animeSlug, item)
  for (const item of props.continueItems) map.set(item.animeSlug, item)
  return map
})
const continueSlugs = computed(() => new Set(props.continueItems.map((item) => item.animeSlug)))
const displayAnime = computed(() => {
  const marked = [
    ...primaryAnime.value.map((anime) => ({ anime, isFromNext: false })),
    ...nextAnime.value.map((anime) => ({ anime, isFromNext: true })),
  ]
  if (continueSlugs.value.size === 0) return marked
  return marked.filter(({ anime }) => !continueSlugs.value.has(anime.slug))
})
const hasAnyCard = computed(() => displayAnime.value.length > 0 || props.continueItems.length > 0)
const skeletonCount = computed(() => cols.value > 0 ? (cols.value - (props.continueItems.length + displayAnime.value.length) % cols.value) % cols.value + cols.value * 3 : 0)

async function fetchPage(apiUrl: string, page: number): Promise<PageData> {
  return $fetch<PageData>(apiUrl, { query: { page } })
}

async function loadMore() {
  if (loading.value || isEnd.value) return
  loading.value = true
  try {
    if (!primaryEnd.value) {
      const nextPage = gridState.value.primarySize + 1
      gridState.value.primaryPages.push(await fetchPage(props.apiUrl, nextPage))
      gridState.value.primarySize = nextPage
    } else if (props.nextApiUrl && !nextEnd.value) {
      const nextPage = gridState.value.nextSize + 1
      if (nextPage === 1 && props.nextInitialData) gridState.value.nextPages.push(props.nextInitialData)
      else gridState.value.nextPages.push(await fetchPage(props.nextApiUrl, nextPage))
      gridState.value.nextSize = nextPage
    }
  } finally {
    loading.value = false
  }
}

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  if (gridRef.value) {
    const update = () => {
      if (!gridRef.value) return
      cols.value = getComputedStyle(gridRef.value).gridTemplateColumns.split(' ').length
    }
    update()
    resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(gridRef.value)
  }
  let ticking = false
  const check = () => {
    if (loading.value || isEnd.value || !sentinelRef.value) return
    const rect = sentinelRef.value.getBoundingClientRect()
    if (rect.top < window.innerHeight + 800) void loadMore()
  }
  const onScroll = () => {
    if (!ticking) {
      ticking = true
      requestAnimationFrame(() => { check(); ticking = false })
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  check()
  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll)
    resizeObserver?.disconnect()
  })
})

function episodeBadge(episode: string) {
  const num = episode.match(/\d+/)?.[0]
  return num ? `${num} Eps` : ''
}
</script>

<template>
  <div>
    <div ref="gridRef" class="grid grid-cols-2 sm:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] gap-4">
      <div v-for="i in continueItems.length === 0 ? continueCount : 0" :key="`cw-skeleton-${i}`" class="rounded-lg overflow-hidden bg-card animate-pulse">
        <div class="relative aspect-[3/4] bg-zinc-900">
          <div class="absolute bottom-0 left-0 right-0 p-3">
            <div class="h-4 w-3/4 bg-white/10 rounded mb-2" />
            <div class="h-3 w-1/2 bg-white/10 rounded" />
          </div>
        </div>
      </div>

      <NuxtLink
        v-for="item in continueItems"
        :key="`continue-${item.animeSlug}`"
        :to="`/anime/${item.animeSlug}/${item.episodeNum}`"
        class="anime-card block rounded-lg overflow-hidden bg-card relative"
      >
        <div class="relative aspect-[3/4]">
          <NuxtImg :src="item.thumbnail" :alt="item.title" width="300" height="400" format="webp" loading="lazy" sizes="sm:200px md:220px lg:240px" class="object-cover w-full h-full" />
          <div v-if="item.latestEpisode || item.episodeNum" class="absolute top-2 right-2 bg-zinc-700 text-zinc-200 text-xs px-2 py-0.5 rounded font-medium">
            {{ item.latestEpisode ? `${item.latestEpisode} Eps` : `EP ${item.episodeNum}` }}
          </div>
          <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-12" :class="item.duration > 0 && item.currentTime > 0 ? 'pb-5' : ''">
            <p class="text-sm font-semibold text-white leading-tight line-clamp-2">{{ item.title }}</p>
            <p class="text-xs text-zinc-400 mt-1">Lanjutkan EP {{ item.episodeNum }}</p>
          </div>
          <div v-if="item.duration > 0 && item.currentTime > 0" class="absolute bottom-2 left-2 right-2 h-[3px] bg-white/20 rounded-full overflow-hidden">
            <div class="h-full bg-white rounded-full" :style="{ width: `${(item.currentTime / item.duration) * 100}%` }" />
          </div>
        </div>
      </NuxtLink>

      <NuxtLink
        v-for="({ anime, isFromNext }, i) in displayAnime"
        :key="`${anime.slug}-${i}`"
        :to="progressMap.get(anime.slug) ? `/anime/${anime.slug}/${progressMap.get(anime.slug)?.episodeNum}` : `/anime/${anime.slug}`"
        class="anime-card block rounded-lg overflow-hidden bg-card relative"
      >
        <div class="relative aspect-[3/4]">
          <NuxtImg :src="anime.thumbnail" :alt="anime.title" width="300" height="400" format="webp" loading="lazy" sizes="sm:200px md:220px lg:240px" class="object-cover w-full h-full" />
          <div v-if="episodeBadge(anime.episode)" class="absolute top-2 right-2 bg-zinc-700 text-zinc-200 text-xs px-2 py-0.5 rounded font-medium">
            {{ episodeBadge(anime.episode) }}
          </div>
          <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-8" :class="progressMap.get(anime.slug) ? 'pb-5 !pt-12' : ''">
            <p class="text-sm font-semibold text-white leading-tight line-clamp-2">{{ anime.title }}</p>
            <p v-if="progressMap.get(anime.slug)" class="text-xs text-zinc-400 mt-1">Lanjutkan EP {{ progressMap.get(anime.slug)?.episodeNum }}</p>
            <p v-else-if="anime.day || anime.date" class="text-xs text-zinc-400 mt-1">
              {{ anime.day && (isFromNext ? nextShowDay : showDay) ? `${anime.day} · ${anime.date}` : anime.date }}
            </p>
          </div>
          <div v-if="progressMap.get(anime.slug) && progressMap.get(anime.slug)!.duration > 0" class="absolute bottom-2 left-2 right-2 h-[3px] bg-white/20 rounded-full overflow-hidden">
            <div class="h-full bg-white rounded-full" :style="{ width: `${(progressMap.get(anime.slug)!.currentTime / progressMap.get(anime.slug)!.duration) * 100}%` }" />
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
      <p v-if="isEnd && hasAnyCard" class="text-sm text-zinc-600 text-center">No more anime to load</p>
    </div>
  </div>
</template>

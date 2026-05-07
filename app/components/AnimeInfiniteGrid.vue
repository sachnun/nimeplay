<script setup lang="ts">
import type { TrpcOutputs } from '~/types/trpc'
import type { ContinueItem } from '~/utils/types'

type PageData = TrpcOutputs['animePage']

const props = withDefaults(defineProps<{
  pageType: 'ONGOING' | 'COMPLETED'
  initialData: PageData
  showDay?: boolean
  nextPageType?: 'ONGOING' | 'COMPLETED'
  nextInitialData?: PageData
  nextShowDay?: boolean
  continueItems?: ContinueItem[]
  continueCount?: number
}>(), {
  showDay: true,
  nextPageType: undefined,
  nextInitialData: undefined,
  nextShowDay: false,
  continueItems: () => [],
  continueCount: 0,
})

const sentinelRef = ref<HTMLDivElement | null>(null)
const gridRef = ref<HTMLDivElement | null>(null)
const trpc = useTrpc()
const cols = ref(2)

function pageSignature(data?: PageData) {
  return `${data?.totalPages ?? 1}:${data?.anime.map((anime) => anime.slug).join('|') ?? ''}`
}

const dataKey = computed(() => [
  props.pageType,
  props.nextPageType ?? '',
  pageSignature(props.initialData),
  pageSignature(props.nextInitialData),
].join(':'))

const gridState = useState<{
  dataKey: string
  primaryPages: PageData[]
  nextPages: PageData[]
  primarySize: number
  nextSize: number
}>(`anime-grid:${props.pageType}:${props.nextPageType ?? ''}`, () => ({
  dataKey: dataKey.value,
  primaryPages: [props.initialData],
  nextPages: [],
  primarySize: 1,
  nextSize: 0,
}))
const loading = ref(false)
const loadError = ref(false)
const { progressMap, syncProgress } = useAnimeProgressMap(() => props.continueItems)
const {
  onProgressCardPointerDown,
  onProgressCardPointerMove,
  onProgressCardPointerEnd,
  onProgressCardClick,
  onProgressCardContextMenu,
} = useProgressCardLongPress()

onMounted(() => {
  syncProgress()
})

function resetGridState() {
  gridState.value = {
    dataKey: dataKey.value,
    primaryPages: [props.initialData],
    nextPages: [],
    primarySize: 1,
    nextSize: 0,
  }
}

watch(dataKey, () => {
  if (gridState.value.dataKey !== dataKey.value) resetGridState()
}, { immediate: true })

const primaryAnime = computed(() => gridState.value.primaryPages.flatMap((d) => d.anime))
const totalPages = computed(() => gridState.value.primaryPages[0]?.totalPages ?? 1)
const primaryEnd = computed(() => gridState.value.primarySize >= totalPages.value)
const nextAnime = computed(() => primaryEnd.value ? gridState.value.nextPages.flatMap((d) => d.anime) : [])
const nextTotalPages = computed(() => gridState.value.nextPages[0]?.totalPages ?? 1)
const nextEnd = computed(() => !props.nextPageType || (primaryEnd.value && gridState.value.nextSize >= nextTotalPages.value))
const isEnd = computed(() => primaryEnd.value && nextEnd.value)

const continueSlugs = computed(() => new Set(props.continueItems.map((item) => item.animeSlug)))
const displayAnime = computed(() => {
  const marked = [
    ...primaryAnime.value.map((anime) => ({ anime, isFromNext: false })),
    ...nextAnime.value.map((anime) => ({ anime, isFromNext: true })),
  ]
  if (continueSlugs.value.size === 0) return marked
  return marked.filter(({ anime }) => !continueSlugs.value.has(anime.slug))
})
const displayCards = computed(() => displayAnime.value.map(({ anime, isFromNext }) => {
  const progress = progressMap.value.get(anime.slug)
  return {
    anime,
    isFromNext,
    progress,
    badge: episodeBadge(anime.episode),
    to: progress ? `/${anime.slug}/${progress.episodeNum}` : `/${anime.slug}`,
  }
}))
const hasAnyCard = computed(() => displayAnime.value.length > 0 || props.continueItems.length > 0)
const skeletonCount = computed(() => cols.value > 0 ? (cols.value - (props.continueItems.length + displayAnime.value.length) % cols.value) % cols.value + cols.value * 3 : 0)

async function fetchPage(type: 'ONGOING' | 'COMPLETED', page: number): Promise<PageData> {
  return trpc.animePage.query({ type, page })
}

async function loadPrimaryPage() {
  const nextPage = gridState.value.primarySize + 1
  gridState.value.primaryPages.push(await fetchPage(props.pageType, nextPage))
  gridState.value.primarySize = nextPage
}

async function loadNextPage() {
  const nextPage = gridState.value.nextSize + 1
  const data = nextPage === 1 && props.nextInitialData
    ? props.nextInitialData
    : await fetchPage(props.nextPageType!, nextPage)
  gridState.value.nextPages.push(data)
  gridState.value.nextSize = nextPage
}

async function loadNextAvailablePage() {
  if (!primaryEnd.value) return loadPrimaryPage()
  if (props.nextPageType && !nextEnd.value) return loadNextPage()
}

async function loadMore() {
  await loadGridPage({
    loading,
    loadError,
    isEnd,
    load: loadNextAvailablePage,
    afterLoad: () => fillGridViewport(isSentinelNearViewport, loadMore),
  })
}

const { isSentinelNearViewport } = useInfiniteGridObserver({ gridRef, sentinelRef, cols, isEnd, loadMore })

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
        v-for="(item, i) in continueItems"
        :key="`continue-${item.animeSlug}`"
        :to="`/${item.animeSlug}/${item.episodeNum}`"
        class="block rounded-lg overflow-hidden bg-card relative outline-none hover:border-accent focus:border-accent hover:z-10 focus:z-10"
        @pointerdown="onProgressCardPointerDown($event, item.animeSlug)"
        @pointermove="onProgressCardPointerMove"
        @pointerup="onProgressCardPointerEnd"
        @pointerleave="onProgressCardPointerEnd"
        @pointercancel="onProgressCardPointerEnd"
        @click.capture="onProgressCardClick"
        @contextmenu="onProgressCardContextMenu($event, true)"
      >
        <div class="relative aspect-[3/4]">
          <img :src="item.thumbnail" :alt="item.title" width="300" height="400" :loading="i < 2 ? 'eager' : 'lazy'" :fetchpriority="i < 2 ? 'high' : 'auto'" decoding="async" sizes="(min-width: 640px) 200px, 50vw" class="object-cover w-full h-full">
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
        v-for="({ anime, isFromNext, progress, badge, to }, i) in displayCards"
        :key="`${anime.slug}-${i}`"
        :to="to"
        class="block rounded-lg overflow-hidden bg-card relative outline-none hover:border-accent focus:border-accent hover:z-10 focus:z-10"
        @pointerdown="onProgressCardPointerDown($event, progress ? anime.slug : null)"
        @pointermove="onProgressCardPointerMove"
        @pointerup="onProgressCardPointerEnd"
        @pointerleave="onProgressCardPointerEnd"
        @pointercancel="onProgressCardPointerEnd"
        @click.capture="onProgressCardClick"
        @contextmenu="onProgressCardContextMenu($event, Boolean(progress))"
      >
        <div class="relative aspect-[3/4]">
          <img :src="anime.thumbnail" :alt="anime.title" width="300" height="400" :loading="continueItems.length + i < 4 ? 'eager' : 'lazy'" :fetchpriority="continueItems.length + i < 2 ? 'high' : 'auto'" decoding="async" sizes="(min-width: 640px) 200px, 50vw" class="object-cover w-full h-full">
          <div v-if="badge" class="absolute top-2 right-2 bg-zinc-700 text-zinc-200 text-xs px-2 py-0.5 rounded font-medium">
            {{ badge }}
          </div>
          <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-8" :class="progress ? 'pb-5 !pt-12' : ''">
            <p class="text-sm font-semibold text-white leading-tight line-clamp-2">{{ anime.title }}</p>
            <p v-if="progress" class="text-xs text-zinc-400 mt-1">Lanjutkan EP {{ progress.episodeNum }}</p>
            <p v-else-if="anime.day || anime.date" class="text-xs text-zinc-400 mt-1">
              {{ anime.day && (isFromNext ? nextShowDay : showDay) ? `${anime.day} · ${anime.date}` : anime.date }}
            </p>
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
      <p v-if="isEnd && hasAnyCard" class="text-sm text-zinc-600 text-center">No more anime to load</p>
      <button v-else-if="loadError" type="button" class="block mx-auto text-sm text-zinc-400 hover:text-white" @click="loadMore">
        Gagal memuat anime. Coba lagi
      </button>
    </div>
  </div>
</template>

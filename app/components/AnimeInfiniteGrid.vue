<script setup lang="ts">
import type { AnimeCard } from '~/utils/types'

interface PageData {
  anime: AnimeCard[]
  totalPages: number
}

const props = withDefaults(defineProps<{
  pageType: 'ONGOING' | 'COMPLETED'
  initialData: PageData
  showDay?: boolean
  nextPageType?: 'ONGOING' | 'COMPLETED'
  nextInitialData?: PageData
  nextShowDay?: boolean
}>(), {
  showDay: true,
  nextPageType: undefined,
  nextInitialData: undefined,
  nextShowDay: false,
})

const sentinelRef = ref<HTMLDivElement | null>(null)
const gridRef = ref<HTMLDivElement | null>(null)
const cols = ref(2)
const gridState = useState<{
  primaryPages: PageData[]
  nextPages: PageData[]
  primarySize: number
  nextSize: number
}>(`anime-grid:${props.pageType}:${props.nextPageType ?? ''}`, () => ({
  primaryPages: [props.initialData],
  nextPages: [],
  primarySize: 1,
  nextSize: 0,
}))
const loading = ref(false)
const loadError = ref(false)
const { progressMap, syncProgress } = useAnimeProgressMap(() => [])
const {
  onProgressCardPointerDown,
  onProgressCardPointerMove,
  onProgressCardPointerEnd,
  onProgressCardClick,
  onProgressCardContextMenu,
} = useProgressCardLongPress()

onMounted(() => {
  void syncProgress()
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
const nextEnd = computed(() => !props.nextPageType || (primaryEnd.value && gridState.value.nextSize >= nextTotalPages.value))
const isEnd = computed(() => primaryEnd.value && nextEnd.value)

const displayAnime = computed(() => [
  ...primaryAnime.value.map((anime) => ({ anime, isFromNext: false })),
  ...nextAnime.value.map((anime) => ({ anime, isFromNext: true })),
])
const displayCards = computed(() => displayAnime.value.map(({ anime, isFromNext }) => {
  const progress = progressMap.value.get(anime.malId)
  return {
    anime,
    isFromNext,
    progress,
    badge: episodeBadge(anime.episode),
    to: `/anime/${anime.malId}`,
  }
}))
const hasAnyCard = computed(() => displayAnime.value.length > 0)

async function fetchPage(type: 'ONGOING' | 'COMPLETED', page: number): Promise<PageData> {
  return $fetch('/api/anime-page', { params: { type, page } })
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

function goToEpisode(malId: number, episodeNum: string | number) {
  void navigateTo(`/anime/${malId}/${episodeNum}`)
}
</script>

<template>
  <div>
    <div ref="gridRef" class="grid grid-cols-2 sm:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] gap-4">
      <NuxtLink
        v-for="({ anime, isFromNext, progress, badge, to }, i) in displayCards"
        :key="`${anime.malId}-${i}`"
        :to="to"
        class="block rounded-lg overflow-hidden bg-card relative outline-none group hover:border-accent focus:border-accent hover:z-10 focus:z-10"
        @pointerdown="onProgressCardPointerDown($event, progress ? anime.malId : null)"
        @pointermove="onProgressCardPointerMove"
        @pointerup="onProgressCardPointerEnd"
        @pointerleave="onProgressCardPointerEnd"
        @pointercancel="onProgressCardPointerEnd"
        @click.capture="onProgressCardClick"
        @contextmenu="onProgressCardContextMenu($event, Boolean(progress))"
      >
        <div class="relative aspect-[3/4] overflow-hidden">
          <img :src="anime.thumbnail" :alt="anime.title" width="300" height="400" :loading="i < 4 ? 'eager' : 'lazy'" :fetchpriority="i < 2 ? 'high' : 'auto'" decoding="async" sizes="(min-width: 640px) 200px, 50vw" class="object-cover w-full h-full transition-transform duration-300 ease-out group-hover:scale-110">
          <div v-if="badge" class="absolute top-2 right-2 bg-zinc-700 text-zinc-200 text-xs px-2 py-0.5 rounded font-medium">
            {{ badge }}
          </div>
          <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-8" :class="progress ? 'pb-5 !pt-12' : ''">
            <p class="text-sm font-semibold text-white leading-tight line-clamp-2">{{ anime.title }}</p>
            <p v-if="progress" class="text-xs text-zinc-400 mt-1 cursor-pointer" @click.stop.prevent="goToEpisode(anime.malId, progress.episodeNumber ?? progress.episodeNumber)">Lanjutkan EP {{ progress.episodeNumber }}</p>
            <p v-else-if="anime.day || anime.date" class="text-xs text-zinc-400 mt-1">
              {{ anime.day && (isFromNext ? nextShowDay : showDay) ? (anime.date ? `${anime.day} · ${anime.date}` : anime.day) : anime.date }}
            </p>
          </div>
          <div v-if="progress && progress.duration > 0" class="absolute bottom-2 left-2 right-2 h-[3px] bg-white/20 rounded-full overflow-hidden cursor-pointer" @click.stop.prevent="goToEpisode(anime.malId, progress.episodeNumber ?? progress.episodeNumber)">
            <div class="h-full bg-white rounded-full" :style="{ width: `${(progress.currentTime / progress.duration) * 100}%` }" />
          </div>
        </div>
      </NuxtLink>
    </div>

    <div ref="sentinelRef" class="py-4">
      <p v-if="isEnd && hasAnyCard" class="text-sm text-zinc-600 text-center">No more anime to load</p>
      <button v-else-if="loadError" type="button" class="block mx-auto text-sm text-zinc-400 hover:text-white" @click="loadMore">
        Gagal memuat anime. Coba lagi
      </button>
    </div>
  </div>
</template>

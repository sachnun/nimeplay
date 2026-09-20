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

const sentinelRef = shallowRef<HTMLDivElement | null>(null)
const gridRef = shallowRef<HTMLDivElement | null>(null)
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
const loadServerError = ref(false)
const { progressMap, syncProgress } = useAnimeProgressMap(() => [])

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
  const resumeTo = progress ? `/anime/${anime.malId}/${progress.episodeNumber}` : undefined
  const showDate = anime.day && (isFromNext ? props.nextShowDay : props.showDay)
  return {
    anime,
    badge: episodeBadge(anime.episode),
    to: `/anime/${anime.malId}`,
    resumeTo,
    subtitle: progress
      ? `Lanjutkan EP ${progress.episodeNumber}`
      : showDate
        ? (anime.date ? `${anime.day} · ${anime.date}` : anime.day)
        : anime.date,
    progressPct: progress && progress.duration > 0 ? (progress.currentTime / progress.duration) * 100 : undefined,
  }
}))
const hasAnyCard = computed(() => displayAnime.value.length > 0)
const showPlane = computed(() => loadError.value && loadServerError.value && !hasAnyCard.value)

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
    loadServerError,
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
    <div ref="gridRef" class="grid grid-cols-2 [@media(min-width:640px)_and_(min-height:601px)]:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] [@media(min-width:640px)_and_(max-height:600px)]:[grid-template-columns:repeat(auto-fill,minmax(130px,1fr))] gap-4">
      <AnimePosterCard
        v-for="({ anime, badge, to, resumeTo, subtitle, progressPct }, i) in displayCards"
        :key="`${anime.malId}-${i}`"
        :to="to"
        :thumbnail="anime.thumbnail"
        :title="anime.title"
        :badge="badge"
        :subtitle="subtitle"
        :resume-to="resumeTo"
        :progress-pct="progressPct"
        :priority="i < 10"
      />
    </div>

    <EmptyState v-if="showPlane" />
    <div ref="sentinelRef" class="py-4">
      <button v-if="loadError && !showPlane" type="button" class="block mx-auto text-sm text-zinc-400 hover:text-white" @click="loadMore">
        Gagal memuat anime. Coba lagi
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GenreAnimeCard } from '~/utils/types'

interface PageData {
  anime: GenreAnimeCard[]
  totalPages: number
}

const props = defineProps<{
  genreSlug: string
}>()

const sentinelRef = shallowRef<HTMLDivElement | null>(null)
const gridRef = shallowRef<HTMLDivElement | null>(null)
const cols = ref(2)
const gridState = useState<{ pages: PageData[]; size: number }>(`genre-grid:${props.genreSlug}`, () => ({ pages: [], size: 0 }))
const loading = ref(false)
const loadError = ref(false)
const loadServerError = ref(false)
const { progressMap, syncProgress } = useAnimeProgressMap(() => [])

onMounted(() => {
  void syncProgress()
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void syncProgress()
  }
  document.addEventListener('visibilitychange', onVisibility)

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility)
  })
})

const allAnime = computed(() => gridState.value.pages.flatMap((d) => d.anime))
const showPlane = computed(() => loadError.value && loadServerError.value && allAnime.value.length === 0)
const totalPages = computed(() => gridState.value.pages[0]?.totalPages ?? 1)
const isEnd = computed(() => gridState.value.size >= totalPages.value)
const animeCards = computed(() => allAnime.value.map((anime) => {
  const progress = progressMap.value.get(anime.malId)
  const latest = Number(anime.episodes?.match(/\d+/)?.[0])
  return {
    anime,
    to: `/anime/${anime.malId}`,
    badge: anime.episodes && /\d/.test(anime.episodes) ? anime.episodes : '',
    newEpisode: progress?.latestEpisode !== undefined && Number.isFinite(latest) && latest > progress.latestEpisode,
    resumeTo: progress ? `/anime/${anime.malId}/${progress.episodeNumber}` : undefined,
    subtitle: progress ? `Lanjutkan EP ${progress.episodeNumber}` : anime.date,
    progressPct: progress && progress.duration > 0 ? (progress.currentTime / progress.duration) * 100 : undefined,
  }
}))
async function loadPage(page: number) {
  return $fetch<PageData>(`/api/genre/${props.genreSlug}`, { params: { page } })
}

async function appendNextPage() {
  const next = gridState.value.size + 1
  gridState.value.pages.push(await loadPage(next))
  gridState.value.size = next
}

async function loadMore() {
  await loadGridPage({
    loading,
    loadError,
    loadServerError,
    isEnd,
    load: appendNextPage,
    afterLoad: () => fillGridViewport(isSentinelNearViewport, loadMore),
  })
}

watch(() => props.genreSlug, () => {
  if (gridState.value.pages.length === 0) void loadMore()
}, { immediate: true })

const { isSentinelNearViewport } = useInfiniteGridObserver({ gridRef, sentinelRef, cols, isEnd, loadMore })

</script>

<template>
  <div>
    <div ref="gridRef" class="grid grid-cols-2 [@media(min-width:640px)_and_(min-height:601px)]:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] [@media(min-width:640px)_and_(max-height:600px)]:[grid-template-columns:repeat(auto-fill,minmax(130px,1fr))] gap-4">
      <AnimePosterCard
        v-for="({ anime, to, badge, newEpisode, subtitle, resumeTo, progressPct }, i) in animeCards"
        :key="`${anime.malId}-${i}`"
        :to="to"
        :thumbnail="anime.thumbnail"
        :title="anime.title"
        :badge="badge"
        :new-episode="newEpisode"
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

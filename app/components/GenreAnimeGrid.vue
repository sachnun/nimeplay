<script setup lang="ts">
import type { TrpcOutputs } from '~/types/trpc'
import type { ContinueItem } from '~/utils/types'

type PageData = TrpcOutputs['genre']

const props = withDefaults(defineProps<{
  genreSlug: string
  continueItems?: ContinueItem[]
}>(), {
  continueItems: () => [],
})

const sentinelRef = ref<HTMLDivElement | null>(null)
const gridRef = ref<HTMLDivElement | null>(null)
const trpc = useTrpc()
const cols = ref(2)
const pages = ref<PageData[]>([])
const size = ref(0)
const loading = ref(false)
const loadError = ref(false)
const { progressMap, syncProgress } = useAnimeProgressMap(() => props.continueItems)
const progressCard = useProgressCardLongPress()

const allAnime = computed(() => pages.value.flatMap((d) => d.anime))
const totalPages = computed(() => pages.value[0]?.totalPages ?? 1)
const isEnd = computed(() => size.value >= totalPages.value)
const animeCards = computed(() => allAnime.value.map((anime) => {
  const progress = progressMap.value.get(anime.slug)
  return {
    anime,
    progress,
    to: progress ? `/${anime.slug}/${progress.episodeNum}` : `/${anime.slug}`,
  }
}))
const skeletonCount = computed(() => Math.max((cols.value - allAnime.value.length % cols.value) % cols.value + cols.value * 3, 18))

async function loadPage(page: number) {
  return trpc.genre.query({ slug: props.genreSlug, page })
}

async function appendNextPage() {
  const next = size.value + 1
  pages.value.push(await loadPage(next))
  size.value = next
}

async function loadMore() {
  await loadGridPage({
    loading,
    loadError,
    isEnd,
    load: appendNextPage,
    afterLoad: () => fillGridViewport(isSentinelNearViewport, loadMore),
  })
}

async function reset() {
  pages.value = []
  size.value = 0
  await loadMore()
}

watch(() => props.genreSlug, () => { void reset() }, { immediate: true })

const { isSentinelNearViewport } = useInfiniteGridObserver({ gridRef, sentinelRef, cols, isEnd, loadMore })

onMounted(() => {
  syncProgress()
  window.addEventListener('storage', syncProgress)
  const onVisibility = () => {
    if (document.visibilityState === 'visible') syncProgress()
  }
  document.addEventListener('visibilitychange', onVisibility)

  onBeforeUnmount(() => {
    window.removeEventListener('storage', syncProgress)
    document.removeEventListener('visibilitychange', onVisibility)
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
        class="block rounded-lg overflow-hidden bg-card relative outline-none hover:border-accent focus:border-accent hover:z-10 focus:z-10"
        @pointerdown="progressCard.onProgressCardPointerDown($event, progress ? anime.slug : null)"
        @pointermove="progressCard.onProgressCardPointerMove"
        @pointerup="progressCard.onProgressCardPointerEnd"
        @pointerleave="progressCard.onProgressCardPointerEnd"
        @pointercancel="progressCard.onProgressCardPointerEnd"
        @click.capture="progressCard.onProgressCardClick"
        @contextmenu="progressCard.onProgressCardContextMenu($event, Boolean(progress))"
      >
        <div class="relative aspect-[3/4]">
          <img :src="anime.thumbnail" :alt="anime.title" width="300" height="400" :loading="i < 4 ? 'eager' : 'lazy'" :fetchpriority="i < 2 ? 'high' : 'auto'" decoding="async" sizes="(min-width: 640px) 200px, 50vw" class="object-cover w-full h-full">
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
      <button v-else-if="loadError" type="button" class="block mx-auto text-sm text-zinc-400 hover:text-white" @click="loadMore">
        Gagal memuat anime. Coba lagi
      </button>
    </div>
  </div>
</template>

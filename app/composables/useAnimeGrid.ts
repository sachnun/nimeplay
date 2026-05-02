import { computed, onBeforeUnmount, onMounted, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue'
import { getContinueWatching } from '~/utils/watchHistory'

export interface AnimeProgressEntry {
  animeSlug: string
  episodeNum: string
  episodeSlug: string
  currentTime: number
  duration: number
}

export function useAnimeProgressMap(continueItems: MaybeRefOrGetter<AnimeProgressEntry[]>) {
  const allProgress = ref<AnimeProgressEntry[]>([])

  function syncProgress() {
    const all = getContinueWatching()
    allProgress.value = all.length > 0 ? all : toValue(continueItems)
  }

  const progressMap = computed(() => {
    const map = new Map<string, AnimeProgressEntry>()
    for (const item of allProgress.value) map.set(item.animeSlug, item)
    for (const item of toValue(continueItems)) map.set(item.animeSlug, item)
    return map
  })

  return { progressMap, syncProgress }
}

export function useInfiniteGridObserver(options: {
  gridRef: Ref<HTMLDivElement | null>
  sentinelRef: Ref<HTMLDivElement | null>
  cols: Ref<number>
  isEnd: MaybeRefOrGetter<boolean>
  loadMore: () => void | Promise<void>
}) {
  let resizeObserver: ResizeObserver | null = null
  let intersectionObserver: IntersectionObserver | null = null

  function updateColumnCount() {
    if (!options.gridRef.value) return
    options.cols.value = getComputedStyle(options.gridRef.value).gridTemplateColumns.split(' ').length
  }

  function isSentinelNearViewport() {
    if (!options.sentinelRef.value || toValue(options.isEnd)) return false
    const rect = options.sentinelRef.value.getBoundingClientRect()
    return rect.top <= window.innerHeight + 800 && rect.bottom >= -800
  }

  onMounted(() => {
    if (options.gridRef.value) {
      updateColumnCount()
      resizeObserver = new ResizeObserver(updateColumnCount)
      resizeObserver.observe(options.gridRef.value)
    }

    intersectionObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void options.loadMore()
    }, { rootMargin: '800px 0px' })
    if (options.sentinelRef.value) intersectionObserver.observe(options.sentinelRef.value)
  })

  onBeforeUnmount(() => {
    intersectionObserver?.disconnect()
    resizeObserver?.disconnect()
  })

  return { isSentinelNearViewport }
}

export async function loadGridPage(options: {
  loading: Ref<boolean>
  loadError: Ref<boolean>
  isEnd: MaybeRefOrGetter<boolean>
  load: () => Promise<void>
  afterLoad: () => Promise<void>
}) {
  if (options.loading.value || toValue(options.isEnd)) return
  options.loading.value = true
  options.loadError.value = false
  let loaded = false
  try {
    await options.load()
    loaded = true
  } catch {
    options.loadError.value = true
  } finally {
    options.loading.value = false
  }
  if (loaded) await options.afterLoad()
}

export async function fillGridViewport(isSentinelNearViewport: () => boolean, loadMore: () => void | Promise<void>) {
  await nextTick()
  if (isSentinelNearViewport()) void loadMore()
}

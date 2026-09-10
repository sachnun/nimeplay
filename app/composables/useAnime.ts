import type { MaybeRefOrGetter, Ref } from 'vue'
import { fetchAnimeMetadata } from '~/utils/remote'
import type { AnimeMetadata } from '~/utils/types'

interface AnimeProgressEntry {
  malId: number
  episodeNumber: number
  currentTime: number
  duration: number
}

export function useAnimeProgressMap(continueItems: MaybeRefOrGetter<AnimeProgressEntry[]>) {
  const allProgress = ref<AnimeProgressEntry[]>([])

  async function syncProgress() {
    const all = await getContinueWatching()
    allProgress.value = all.length > 0 ? all : toValue(continueItems)
  }

  const progressMap = computed(() => {
    const map = new Map<number, AnimeProgressEntry>()
    for (const item of allProgress.value) map.set(item.malId, item)
    for (const item of toValue(continueItems)) map.set(item.malId, item)
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
  loadServerError?: Ref<boolean>
  isEnd: MaybeRefOrGetter<boolean>
  load: () => Promise<void>
  afterLoad: () => Promise<void>
}) {
  if (options.loading.value || toValue(options.isEnd)) return
  options.loading.value = true
  options.loadError.value = false
  if (options.loadServerError) options.loadServerError.value = false
  let loaded = false
  try {
    await options.load()
    loaded = true
  } catch (err) {
    options.loadError.value = true
    if (options.loadServerError) options.loadServerError.value = isServerError(err)
  } finally {
    options.loading.value = false
  }
  if (loaded) await options.afterLoad()
}

export async function fillGridViewport(isSentinelNearViewport: () => boolean, loadMore: () => void | Promise<void>) {
  await nextTick()
  if (isSentinelNearViewport()) void loadMore()
}

export function useAnimeMetadata(malId: Ref<number> | number, title: Ref<string> | string, japaneseTitle?: Ref<string | undefined> | string) {
  const data = ref<AnimeMetadata | null>(null)
  const loading = ref(true)

  const idRef = toRef(malId)
  const titleRef = toRef(title)
  const japaneseRef = japaneseTitle === undefined ? ref<string | undefined>() : toRef(japaneseTitle)

  const load = async () => {
    if (!idRef.value) return
    loading.value = true
    const result = await fetchAnimeMetadata(idRef.value)
    if (result) data.value = result
    loading.value = false
  }

  if (import.meta.client) {
    const { $runIdle } = useNuxtApp()
    watch([idRef, titleRef, japaneseRef], (_, __, onCleanup) => {
      loading.value = true
      const cancel = $runIdle(() => { void load() }, 1800)
      onCleanup(cancel)
    }, { immediate: true })
  }

  return { data, loading }
}

const LONG_PRESS_DELAY_MS = 550
const MOVE_TOLERANCE_PX = 12

export function useProgressCardLongPress() {
  let timer: number | null = null
  let startX = 0
  let startY = 0
  let suppressClick = false

  function clearLongPress() {
    if (timer === null) return
    window.clearTimeout(timer)
    timer = null
  }

  function onProgressCardPointerDown(event: PointerEvent, malId: number | null) {
    if (!malId || event.button !== 0) return
    clearLongPress()
    startX = event.clientX
    startY = event.clientY
    timer = window.setTimeout(() => {
      timer = null
      suppressClick = true
      void navigateTo(`/anime/${malId}`)
    }, LONG_PRESS_DELAY_MS)
  }

  function onProgressCardPointerMove(event: PointerEvent) {
    if (timer === null) return
    if (Math.abs(event.clientX - startX) > MOVE_TOLERANCE_PX || Math.abs(event.clientY - startY) > MOVE_TOLERANCE_PX) {
      clearLongPress()
    }
  }

  function onProgressCardPointerEnd() {
    clearLongPress()
  }

  function onProgressCardClick(event: MouseEvent) {
    if (!suppressClick) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    suppressClick = false
  }

  function onProgressCardContextMenu(event: MouseEvent, hasProgress: boolean) {
    if (hasProgress) event.preventDefault()
  }

  onBeforeUnmount(clearLongPress)

  return {
    onProgressCardPointerDown,
    onProgressCardPointerMove,
    onProgressCardPointerEnd,
    onProgressCardClick,
    onProgressCardContextMenu,
  }
}

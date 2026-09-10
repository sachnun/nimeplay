<script setup lang="ts">
import type { AnimeDetail } from '~/utils/types'
import type { WatchProgress } from '~/utils/storage'

interface HistoryItem extends WatchProgress {
  title: string
  thumbnail: string
}

useHead({ title: 'History' })

const items = ref<HistoryItem[]>([])
const loading = ref(true)
const clearing = ref(false)
const {
  onProgressCardPointerDown,
  onProgressCardPointerMove,
  onProgressCardPointerEnd,
  onProgressCardClick,
  onProgressCardContextMenu,
} = useProgressCardLongPress()

async function fetchDetail(malId: number): Promise<AnimeDetail | null> {
  try {
    return await $fetch<AnimeDetail>(`/api/anime/${malId}`)
  } catch {
    return null
  }
}

async function loadHistory() {
  loading.value = true
  try {
    const progressList = await getContinueWatching()
    items.value = []
    const queue = [...progressList]
    if (queue.length === 0) return
    const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
      while (queue.length > 0) {
        const entry = queue.shift()
        if (!entry) break
        const detail = await fetchDetail(entry.malId)
        if (!detail) continue
        items.value.push({ ...entry, title: detail.title, thumbnail: detail.thumbnail })
        items.value.sort((a, b) => b.updatedAt - a.updatedAt)
      }
    })
    await Promise.all(workers)
  } finally {
    loading.value = false
  }
}

async function removeItem(malId: number) {
  await removeAnimeProgress(malId)
  items.value = items.value.filter((item) => item.malId !== malId)
}

async function clearHistory() {
  if (clearing.value || items.value.length === 0) return
  clearing.value = true
  try {
    await clearAllProgress()
    items.value = []
  } finally {
    clearing.value = false
  }
}

function goToEpisode(malId: number, episodeNum: number) {
  void navigateTo(`/anime/${malId}/${episodeNum}`)
}

function progressPct(item: HistoryItem) {
  if (!item.duration || item.duration <= 0) return 0
  return Math.min((item.currentTime / item.duration) * 100, 100)
}

onMounted(() => {
  void loadHistory()
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void loadHistory()
  }
  document.addEventListener('visibilitychange', onVisibility)
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility))
})
</script>

<template>
  <div class="px-6 py-8">
    <div class="flex items-center gap-2 mb-6">
      <NuxtLink to="/" title="Kembali" aria-label="Kembali" class="px-3 py-1.5 rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors shrink-0 flex items-center">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2.5" d="M15 19l-7-7 7-7" />
        </svg>
      </NuxtLink>
      <h1 class="text-lg font-semibold text-zinc-100">History</h1>
      <div class="flex-1" />
      <button
        type="button"
        :disabled="clearing || loading || items.length === 0"
        class="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors cursor-pointer disabled:opacity-50"
        @click="clearHistory"
      >
        {{ clearing ? 'Clearing...' : 'Clear' }}
      </button>
    </div>

    <div v-if="loading && items.length === 0" class="grid grid-cols-2 sm:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] gap-4">
      <div v-for="n in 8" :key="n" class="rounded-lg overflow-hidden bg-card">
        <div class="aspect-[3/4] bg-zinc-800 animate-pulse" />
      </div>
    </div>

    <div v-else-if="items.length > 0" class="grid grid-cols-2 sm:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] gap-4">
      <NuxtLink
        v-for="item in items"
        :key="item.malId"
        :to="`/anime/${item.malId}`"
        class="block rounded-lg overflow-hidden bg-card relative outline-none group hover:border-accent focus:border-accent hover:z-10 focus:z-10"
        @pointerdown="onProgressCardPointerDown($event, item.malId)"
        @pointermove="onProgressCardPointerMove"
        @pointerup="onProgressCardPointerEnd"
        @pointerleave="onProgressCardPointerEnd"
        @pointercancel="onProgressCardPointerEnd"
        @click.capture="onProgressCardClick"
        @contextmenu="onProgressCardContextMenu($event, true)"
      >
        <div class="relative aspect-[3/4] overflow-hidden">
          <img :src="item.thumbnail" :alt="item.title" width="300" height="400" loading="lazy" decoding="async" sizes="(min-width: 640px) 200px, 50vw" class="object-cover w-full h-full transition-transform duration-300 ease-out group-hover:scale-110">
          <button
            type="button"
            title="Hapus dari history"
            aria-label="Hapus dari history"
            class="absolute top-2 left-2 p-1.5 rounded-full bg-black/60 text-zinc-300 hover:text-white hover:bg-black/80 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
            @click.stop.prevent="removeItem(item.malId)"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-12 pb-5">
            <p class="text-sm font-semibold text-white leading-tight line-clamp-2">{{ item.title }}</p>
            <p class="text-xs text-zinc-400 mt-1 cursor-pointer" @click.stop.prevent="goToEpisode(item.malId, item.episodeNumber)">Lanjutkan EP {{ item.episodeNumber }}</p>
          </div>
          <div class="absolute bottom-2 left-2 right-2 h-[3px] bg-white/20 rounded-full overflow-hidden cursor-pointer" @click.stop.prevent="goToEpisode(item.malId, item.episodeNumber)">
            <div class="h-full bg-white rounded-full" :style="{ width: `${progressPct(item)}%` }" />
          </div>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Genre } from '~/utils/types'

const props = defineProps<{
  genres: Genre[]
  selectedGenre: Genre | null
}>()

const emit = defineEmits<{
  search: []
  signIn: []
}>()

const detailsRef = ref<HTMLDetailsElement | null>(null)

function onClickOutside(event: MouseEvent) {
  if (detailsRef.value?.open && !detailsRef.value.contains(event.target as Node)) {
    detailsRef.value.open = false
  }
}

onMounted(() => document.addEventListener('click', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside))

const showAll = ref(false)
const visibleCount = ref(20)
const measureRef = ref<HTMLDivElement | null>(null)

function firstRowCount(genres: HTMLElement[]) {
  const first = genres[0]
  if (!first) return 0
  const firstTop = first.getBoundingClientRect().top
  let count = 0
  for (const genre of genres) {
    if (genre.getBoundingClientRect().top - firstTop > 0.5) break
    count++
  }
  return count
}

function fitMoreSlot(containerRight: number, genres: HTMLElement[], count: number, moreEl: HTMLElement, gap: number) {
  let fitted = count
  while (fitted >= 1) {
    const genre = genres[fitted - 1]
    if (!genre) break
    moreEl.textContent = `+${genres.length - fitted} more`
    if (genre.getBoundingClientRect().right + gap + moreEl.getBoundingClientRect().width <= containerRight) break
    fitted--
  }
  const result = Math.max(1, fitted)
  moreEl.textContent = `+${genres.length - result} more`
  return result
}

function calculate() {
  const el = measureRef.value
  if (!el) return
  const genres = Array.from(el.querySelectorAll<HTMLElement>('[data-genre-slot]'))
  if (genres.length === 0) return
  const moreEl = el.querySelector<HTMLElement>('[data-more-slot]')
  const containerRight = el.getBoundingClientRect().right
  const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 8
  let count = firstRowCount(genres)
  if (count < genres.length && moreEl) {
    count = fitMoreSlot(containerRight, genres, count, moreEl, gap)
  }
  visibleCount.value = count
}

let observer: ResizeObserver | null = null
onMounted(() => {
  requestAnimationFrame(calculate)
  if (measureRef.value) {
    observer = new ResizeObserver(calculate)
    observer.observe(measureRef.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
watch(() => props.genres.length, () => nextTick(calculate))

const hasHistory = ref(false)

watch(hasHistory, () => nextTick(calculate))

async function syncHistoryVisibility() {
  try {
    hasHistory.value = (await getContinueWatching()).length > 0
  } catch {
    hasHistory.value = false
  }
}

onMounted(() => {
  void syncHistoryVisibility()
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void syncHistoryVisibility()
  }
  document.addEventListener('visibilitychange', onVisibility)
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility))
})

const selectedIsHidden = computed(() => {
  if (!props.selectedGenre) return false
  return props.genres.findIndex((g) => g.slug === props.selectedGenre?.slug) >= visibleCount.value
})
const effectiveShowAll = computed(() => showAll.value || selectedIsHidden.value)
const displayed = computed(() => effectiveShowAll.value ? props.genres : props.genres.slice(0, visibleCount.value))
const hiddenCount = computed(() => props.genres.length - visibleCount.value)
</script>

<template>
  <div v-if="genres.length > 0" class="mb-6 relative">
    <div class="flex flex-wrap gap-2 flex-1 min-w-0 select-none">
      <details ref="detailsRef" class="group relative shrink-0">
        <summary class="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 group-open:bg-white group-open:text-black group-open:hover:bg-white group-open:hover:text-black transition-colors cursor-pointer list-none" title="Menu">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2.5" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </summary>
        <div class="absolute top-full left-0 mt-2 w-40 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-2 z-50">
          <button class="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer" @click="emit('search')">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search
          </button>
          <button class="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer" @click="emit('signIn')">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Sign In
          </button>
          <a href="/docs" target="_blank" rel="noopener" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            API Docs
            <svg class="w-3 h-3 ml-auto opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </details>
      <div class="relative flex flex-wrap gap-2 flex-1 min-w-0" :class="effectiveShowAll ? '' : 'overflow-hidden max-h-7'">
        <div ref="measureRef" class="flex flex-wrap gap-2 invisible absolute inset-x-0 top-0 pointer-events-none" aria-hidden="true">
          <span v-if="hasHistory" class="px-3 py-1.5 rounded-full text-xs font-medium"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" /></span>
          <span v-for="genre in genres" :key="genre.slug" data-genre-slot class="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap">{{ genre.name }}</span>
          <span data-more-slot class="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap">+{{ genres.length }} more</span>
        </div>
        <NuxtLink v-if="hasHistory" to="/history" title="History" aria-label="History" class="px-3 py-1.5 rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors shrink-0 flex items-center">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M3 3v5h5" />
            <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M12 7v5l4 2" />
          </svg>
        </NuxtLink>
        <NuxtLink
          v-for="genre in displayed"
          :key="genre.slug"
          :to="selectedGenre?.slug === genre.slug ? '/' : `/${genre.slug}`"
          replace
          :aria-current="selectedGenre?.slug === genre.slug ? 'true' : undefined"
          class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
          :class="selectedGenre?.slug === genre.slug ? 'bg-white text-black hover:bg-white hover:text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'"
        >
          {{ genre.name }}
        </NuxtLink>
        <button
          v-if="hiddenCount > 0"
          class="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-800/50 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 transition-colors cursor-pointer"
          @click="showAll = !showAll"
        >
          {{ effectiveShowAll ? 'Show less' : `+${hiddenCount} more` }}
        </button>
      </div>
    </div>
  </div>
</template>

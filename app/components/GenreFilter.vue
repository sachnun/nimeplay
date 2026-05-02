<script setup lang="ts">
import type { Genre } from '~/utils/types'

const props = defineProps<{
  genres: Genre[]
  selectedGenre: Genre | null
}>()

const emit = defineEmits<{
  select: [genre: Genre | null]
  search: []
}>()

const SKELETON_WIDTHS = [
  56, 72, 88, 64, 80, 56, 72, 64, 88, 72,
  56, 80, 64, 72, 88, 60, 76, 68, 84, 56,
  72, 80, 64, 88, 56, 76, 68, 72, 84, 60,
  80, 56, 88, 64, 72, 76, 60, 84, 68, 80,
]
const AVG_PILL = SKELETON_WIDTHS.reduce((a, b) => a + b, 0) / SKELETON_WIDTHS.length

const showAll = ref(false)
const visibleCount = ref(SKELETON_WIDTHS.length)
const measureRef = ref<HTMLDivElement | null>(null)

function fallbackVisibleCount() {
  return Math.max(1, Math.floor((window.innerWidth - 88) / (AVG_PILL + 8)))
}

function countFirstRowItems(children: HTMLElement[], firstTop: number, limit: number) {
  let count = 0
  for (let i = 1; i < limit; i++) {
    const child = children[i]
    if (!child || child.offsetTop > firstTop) break
    count++
  }
  return count
}

function fitMoreSlot(el: HTMLElement, children: HTMLElement[], count: number, moreEl: HTMLElement) {
  const containerWidth = el.offsetWidth
  const moreWidth = moreEl.offsetWidth
  const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 8
  let fitted = count
  while (fitted >= 1) {
    const child = children[fitted]
    if (!child) break
    if (child.offsetLeft + child.offsetWidth + gap + moreWidth <= containerWidth) break
    fitted--
  }
  return Math.max(1, fitted)
}

function calculate() {
  const el = measureRef.value
  if (!el) {
    visibleCount.value = fallbackVisibleCount()
    return
  }
  const children = Array.from(el.children) as HTMLElement[]
  const moreEl = el.querySelector<HTMLElement>('[data-more-slot]')
  if (children.length < 2) return
  const first = children[0]
  if (!first) return
  const limit = moreEl ? children.length - 1 : children.length
  let count = countFirstRowItems(children, first.offsetTop, limit)
  if (count < props.genres.length) {
    count = moreEl ? fitMoreSlot(el, children, count, moreEl) : Math.max(1, count - 1)
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

const selectedIsHidden = computed(() => {
  if (!props.selectedGenre) return false
  return props.genres.findIndex((g) => g.slug === props.selectedGenre?.slug) >= visibleCount.value
})
const effectiveShowAll = computed(() => showAll.value || selectedIsHidden.value)
const displayed = computed(() => effectiveShowAll.value ? props.genres : props.genres.slice(0, visibleCount.value))
const hiddenCount = computed(() => props.genres.length - visibleCount.value)
</script>

<template>
  <div v-if="genres.length === 0" class="mb-6 relative">
    <div class="flex flex-wrap gap-2 overflow-hidden max-h-7">
      <div class="w-8 h-7 rounded-full bg-zinc-800 animate-pulse" />
      <div v-for="(w, i) in SKELETON_WIDTHS.slice(0, visibleCount)" :key="i" class="h-7 rounded-full bg-zinc-800 animate-pulse" :style="{ width: `${w}px` }" />
    </div>
  </div>
  <div v-else class="mb-6 relative">
    <div ref="measureRef" class="flex flex-wrap gap-2 invisible absolute inset-x-0 pointer-events-none" aria-hidden="true">
      <span class="px-3 py-1.5 rounded-full text-xs font-medium"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" /></span>
      <span v-for="genre in genres" :key="genre.slug" class="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap">{{ genre.name }}</span>
      <span data-more-slot class="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap">+{{ genres.length }} more</span>
    </div>

    <div class="flex flex-wrap gap-2" :class="effectiveShowAll ? '' : 'overflow-hidden max-h-7'">
      <button class="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors cursor-pointer" title="Search" @click="emit('search')">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>
      <button
        v-for="genre in displayed"
        :key="genre.slug"
        class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
        :class="selectedGenre?.slug === genre.slug ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'"
        @click="emit('select', selectedGenre?.slug === genre.slug ? null : genre)"
      >
        {{ genre.name }}
      </button>
      <button
        v-if="hiddenCount > 0"
        class="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-800/50 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 transition-colors cursor-pointer"
        @click="showAll = !showAll"
      >
        {{ effectiveShowAll ? 'Show less' : `+${hiddenCount} more` }}
      </button>
    </div>
  </div>
</template>

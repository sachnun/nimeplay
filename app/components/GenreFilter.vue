<script setup lang="ts">
import type { Genre } from '~/types'

const props = defineProps<{
  genres: Genre[]
  selectedGenre: Genre | null
}>()

const emit = defineEmits<{
  search: []
  signIn: []
}>()

const scrollRef = shallowRef<HTMLDivElement | null>(null)
const menuButtonRef = shallowRef<HTMLButtonElement | null>(null)
const menuRef = shallowRef<HTMLDivElement | null>(null)
const menuOpen = ref(false)
const menuStyle = ref<Record<string, string>>({})

function positionMenu() {
  const el = menuButtonRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  menuStyle.value = { top: `${rect.bottom + 8}px`, left: `${rect.left}px` }
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) positionMenu()
}

function closeMenu() {
  menuOpen.value = false
}

function onScroll() {
  if (menuOpen.value) positionMenu()
  updateOverflow()
}

const hasMoreLeft = ref(false)
const hasMoreRight = ref(false)

function updateOverflow() {
  const el = scrollRef.value
  if (!el) return
  hasMoreLeft.value = el.scrollLeft > 1
  hasMoreRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

function onClickOutside(event: MouseEvent) {
  if (!menuOpen.value) return
  const target = event.target as Node
  if (menuRef.value?.contains(target) || menuButtonRef.value?.contains(target)) return
  menuOpen.value = false
}

onMounted(() => document.addEventListener('click', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside))

let dragging = false
let moved = false
let startX = 0
let startScroll = 0

function onPointerDown(e: PointerEvent) {
  if (e.pointerType !== 'mouse' || e.button !== 0) return
  const el = scrollRef.value
  if (!el) return
  dragging = true
  moved = false
  startX = e.clientX
  startScroll = el.scrollLeft
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  const el = scrollRef.value
  if (!el) return
  const dx = e.clientX - startX
  if (!moved && Math.abs(dx) > 4) {
    moved = true
    el.setPointerCapture(e.pointerId)
  }
  if (moved) el.scrollLeft = startScroll - dx
}

function onPointerUp(e: PointerEvent) {
  if (!dragging) return
  dragging = false
  const el = scrollRef.value
  if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
}

function onClickCapture(e: MouseEvent) {
  if (!moved) return
  moved = false
  e.preventDefault()
  e.stopPropagation()
}

function onWheel(e: WheelEvent) {
  const el = scrollRef.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  if (max <= 0) return
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (delta === 0) return
  e.preventDefault()
  el.scrollLeft = Math.min(max, Math.max(0, el.scrollLeft + delta))
  if (menuOpen.value) positionMenu()
}

function centerSelected(behavior: ScrollBehavior = 'smooth') {
  const el = scrollRef.value
  if (!el) return
  const active = el.querySelector<HTMLElement>('[data-active="true"]')
  if (!active) return
  const elRect = el.getBoundingClientRect()
  const activeRect = active.getBoundingClientRect()
  const left = el.scrollLeft + (activeRect.left - elRect.left) - (el.clientWidth - activeRect.width) / 2
  const max = el.scrollWidth - el.clientWidth
  el.scrollTo({ left: Math.max(0, Math.min(max, left)), behavior })
}

watch(
  () => props.selectedGenre?.slug,
  () => nextTick(() => centerSelected()),
)
watch(
  () => props.genres.length,
  () => nextTick(updateOverflow),
)

if (import.meta.server && props.selectedGenre) {
  useHead({
    script: [
      {
        key: 'genre-scroll-init',
        tagPosition: 'bodyClose',
        innerHTML:
          "(function(){var s=document.querySelector('[data-genre-scroll]');if(!s)return;var a=s.querySelector('[data-active=\"true\"]');if(!a)return;var r=s.getBoundingClientRect(),b=a.getBoundingClientRect(),m=s.scrollWidth-s.clientWidth;s.scrollLeft=Math.max(0,Math.min(m,s.scrollLeft+(b.left-r.left)-(s.clientWidth-b.width)/2));})();",
      },
    ],
  })
}

let observer: ResizeObserver | null = null
onMounted(() => {
  const el = scrollRef.value
  if (el) {
    el.addEventListener('wheel', onWheel, { passive: false })
    observer = new ResizeObserver(updateOverflow)
    observer.observe(el)
  }
  requestAnimationFrame(() => {
    centerSelected('auto')
    updateOverflow()
  })
})
onBeforeUnmount(() => {
  scrollRef.value?.removeEventListener('wheel', onWheel)
  observer?.disconnect()
})

const hasHistory = ref(false)

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
    if (menuOpen.value) positionMenu()
    updateOverflow()
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('resize', onVisibility)
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('resize', onVisibility)
  })
})
</script>

<template>
  <div v-if="genres.length > 0" class="mb-6 select-none relative">
    <div
      ref="scrollRef"
      data-genre-scroll
      class="flex gap-2 overflow-x-auto pt-8 pr-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch]"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @scroll="onScroll"
      @dragstart.prevent
      @click.capture="onClickCapture"
    >
      <button
        ref="menuButtonRef"
        type="button"
        class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 cursor-pointer"
        :class="menuOpen ? 'bg-white text-black hover:bg-white hover:text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'"
        title="Menu"
        aria-label="Menu"
        @click="toggleMenu"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2.5" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <NuxtLink v-if="hasHistory" to="/history" title="History" aria-label="History" draggable="false" class="px-3 py-1.5 rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors shrink-0 flex items-center [-webkit-user-drag:none]">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M3 3v5h5" />
          <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M12 7v5l4 2" />
        </svg>
      </NuxtLink>
      <NuxtLink
        v-for="genre in genres"
        :key="genre.slug"
        :to="selectedGenre?.slug === genre.slug ? '/' : `/${genre.slug}`"
        replace
        draggable="false"
        :data-active="selectedGenre?.slug === genre.slug ? 'true' : undefined"
        :aria-current="selectedGenre?.slug === genre.slug ? 'true' : undefined"
        class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer [-webkit-user-drag:none]"
        :class="selectedGenre?.slug === genre.slug ? 'bg-white text-black hover:bg-white hover:text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'"
      >
        {{ genre.name }}
      </NuxtLink>
    </div>

    <div
      v-if="hasMoreLeft"
      class="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent"
      aria-hidden="true"
    />
    <div
      v-if="hasMoreRight"
      class="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent"
      aria-hidden="true"
    />

    <Teleport to="body">
      <div
        v-if="menuOpen"
        ref="menuRef"
        class="fixed w-40 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-2 z-50"
        :style="menuStyle"
        @click="closeMenu"
      >
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
    </Teleport>
  </div>
</template>

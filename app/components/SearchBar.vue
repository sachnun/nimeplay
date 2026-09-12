<script setup lang="ts">
import type { SearchResult } from '~/utils/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; open: [] }>()

const query = ref('')
const results = ref<SearchResult[]>([])
const loading = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
let debounce: ReturnType<typeof setTimeout> | null = null
let searchToken = 0
let pendingQuery = ''

watch(() => props.open, (open) => {
  if (!import.meta.client) return
  if (open) {
    if (pendingQuery) {
      query.value = pendingQuery
      pendingQuery = ''
    }
    document.body.style.overflow = 'hidden'
    setTimeout(() => inputRef.value?.focus(), 50)
  } else {
    document.body.style.overflow = ''
  }
}, { immediate: true })

watch(query, (value) => {
  if (debounce) clearTimeout(debounce)
  const token = ++searchToken
  debounce = setTimeout(async () => {
    const trimmed = value.trim()
    if (!trimmed) {
      results.value = []
      loading.value = false
      return
    }
    loading.value = true
    try {
      const result = await $fetch<SearchResult[]>('/api/search', { params: { query: trimmed } })
      if (token !== searchToken) return
      results.value = result
    } catch {
      if (token !== searchToken) return
      results.value = []
    } finally {
      if (token === searchToken) loading.value = false
    }
  }, value.trim() ? 500 : 0)
})

function isDesktop() {
  if (typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

function shouldOpenFromKey(event: KeyboardEvent) {
  if (props.open || event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return false
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return false
  return isDesktop()
}

onMounted(() => {
  const handleKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && props.open) {
      emit('close')
      return
    }
    if (!shouldOpenFromKey(event)) return
    pendingQuery += event.key
    emit('open')
  }
  window.addEventListener('keydown', handleKey)
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKey)
    document.body.style.overflow = ''
    if (debounce) clearTimeout(debounce)
  })
})
</script>

<template>
  <div
    v-if="open"
    data-tv-nav-scope
    class="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-[20vh] px-4 cursor-pointer"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-lg bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl flex flex-col max-h-[70vh] cursor-default">
      <div class="flex items-center gap-3 px-4 py-3">
        <svg class="w-5 h-5 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input ref="inputRef" v-model="query" type="text" placeholder="Search anime..." class="flex-1 bg-transparent text-lg text-zinc-100 placeholder-zinc-500 outline-none">
        <button type="button" :disabled="loading" class="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer disabled:cursor-default" @click="query ? (query = '') : emit('close')">
          <svg v-if="loading" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" :stroke-width="2" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div v-if="results.length > 0" class="overflow-y-auto border-t border-zinc-800 p-4">
        <div class="flex flex-col divide-y divide-zinc-800">
          <NuxtLink
            v-for="result in results"
            :key="result.malId"
            :to="`/anime/${result.malId}`"
            class="flex items-center gap-3 px-2 py-2.5 hover:bg-zinc-800/50 rounded-lg transition-colors"
            @click="emit('close')"
          >
            <img :src="result.thumbnail" :alt="result.title" width="48" height="64" loading="lazy" decoding="async" sizes="48px" class="w-12 h-16 rounded object-cover shrink-0 [filter:brightness(0.9)]">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-zinc-100 leading-snug line-clamp-1">{{ result.title }}</p>
              <p class="text-xs text-zinc-400 mt-0.5">{{ result.status }}</p>
              <p v-if="result.genres" class="text-xs text-zinc-500 mt-0.5 line-clamp-1">{{ result.genres }}</p>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

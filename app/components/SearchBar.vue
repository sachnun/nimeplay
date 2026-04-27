<script setup lang="ts">
import type { SearchResult } from '~/utils/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const query = ref('')
const results = ref<SearchResult[]>([])
const loading = ref(false)
const searched = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const trpc = useTrpc()
let debounce: ReturnType<typeof setTimeout> | null = null
let searchToken = 0

watch(() => props.open, (open) => {
  if (!import.meta.client) return
  if (open) {
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
      searched.value = false
      return
    }
    loading.value = true
    searched.value = true
    try {
      const result = await trpc.search.query({ query: trimmed })
      if (token !== searchToken) return
      results.value = result
    } catch {
      if (token !== searchToken) return
      results.value = []
    }
    if (token === searchToken) loading.value = false
  }, value.trim() ? 500 : 0)
})

onMounted(() => {
  const handleKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && props.open) emit('close')
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
    class="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-[10vh] px-4 cursor-pointer"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-lg bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl flex flex-col max-h-[80vh] cursor-default">
      <div class="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
        <svg class="w-5 h-5 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input ref="inputRef" v-model="query" type="text" placeholder="Search anime..." class="flex-1 bg-transparent text-lg text-zinc-100 placeholder-zinc-500 outline-none">
        <button class="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer" @click="query ? (query = '') : emit('close')">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="overflow-y-auto flex-1 p-4">
        <div v-if="loading" class="flex flex-col divide-y divide-zinc-800">
          <div v-for="i in 4" :key="i" class="flex items-center gap-3 px-2 py-2.5">
            <div class="w-12 h-16 rounded bg-zinc-800 animate-pulse shrink-0" />
            <div class="flex-1 min-w-0 space-y-2">
              <div class="h-4 w-3/4 bg-zinc-800 rounded animate-pulse" />
              <div class="h-3 w-1/3 bg-zinc-800/60 rounded animate-pulse" />
              <div class="h-3 w-1/2 bg-zinc-800/60 rounded animate-pulse" />
            </div>
          </div>
        </div>
        <div v-else-if="searched && results.length === 0" class="text-center text-zinc-500 py-12 text-lg">No results found</div>
        <div v-else-if="!searched" class="text-center text-zinc-600 py-12 text-sm">Type to search anime</div>
        <div v-else class="flex flex-col divide-y divide-zinc-800">
          <NuxtLink
            v-for="result in results"
            :key="result.slug"
            :to="`/${result.slug}`"
            class="flex items-center gap-3 px-2 py-2.5 hover:bg-zinc-800/50 rounded-lg transition-colors"
            @click="emit('close')"
          >
            <img :src="result.thumbnail" :alt="result.title" width="48" height="64" loading="lazy" decoding="async" sizes="48px" class="w-12 h-16 rounded object-cover shrink-0">
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

<script lang="ts">
  import type { SearchResult } from '#lib/shared/types'
  import { fetchSearch } from '#lib/api'
  import { onMount } from 'svelte'

  let { open, onclose, onopen }: { open: boolean; onclose: () => void; onopen: () => void } = $props()

  let query = $state('')
  let results = $state<SearchResult[]>([])
  let loading = $state(false)
  let inputEl: HTMLInputElement | null = $state(null)
  let debounce: ReturnType<typeof setTimeout> | null = null
  let searchToken = 0
  let pendingQuery = ''

  function isDesktop() {
    if (typeof window.matchMedia !== 'function') return true
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches
  }

  function shouldOpenFromKey(event: KeyboardEvent) {
    if (open || event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return false
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return false
    return isDesktop()
  }

  function handleKey(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      onclose()
      return
    }
    if (!shouldOpenFromKey(event)) return
    pendingQuery += event.key
    onopen()
  }

  async function runSearch(value: string) {
    const token = ++searchToken
    const trimmed = value.trim()
    if (!trimmed) {
      results = []
      loading = false
      return
    }
    loading = true
    try {
      const result = await fetchSearch(fetch, trimmed)
      if (token !== searchToken) return
      results = result
    } catch {
      if (token !== searchToken) return
      results = []
    } finally {
      if (token === searchToken) loading = false
    }
  }

  $effect(() => {
    if (open) {
      if (pendingQuery) {
        query = pendingQuery
        pendingQuery = ''
      }
      document.body.style.overflow = 'hidden'
      setTimeout(() => inputEl?.focus(), 50)
    } else {
      document.body.style.overflow = ''
    }
  })

  $effect(() => {
    const value = query
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => void runSearch(value), value.trim() ? 500 : 0)
  })

  onMount(() => {
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
      if (debounce) clearTimeout(debounce)
    }
  })
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-[20vh] px-4 cursor-pointer"
    role="button"
    tabindex="-1"
    onclick={e => {
      if (e.target === e.currentTarget) onclose()
    }}
    onkeydown={e => {
      if (e.key === 'Escape') onclose()
    }}
  >
    <div class="w-full max-w-lg bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl flex flex-col max-h-[70vh] cursor-default">
      <div class="flex items-center gap-3 px-4 py-3">
        <svg class="w-5 h-5 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          bind:this={inputEl}
          bind:value={query}
          type="text"
          placeholder="Search anime..."
          class="flex-1 bg-transparent text-lg text-zinc-100 placeholder-zinc-500 outline-none"
        />
        <button
          type="button"
          disabled={loading}
          class="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer disabled:cursor-default"
          onclick={() => (query ? (query = '') : onclose())}
        >
          {#if loading}
            <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          {:else}
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          {/if}
        </button>
      </div>

      {#if results.length > 0}
        <div class="overflow-y-auto border-t border-zinc-800 p-4">
          <div class="flex flex-col divide-y divide-zinc-800">
            {#each results as result (result.malId)}
              <a
                href={`/anime/${result.malId}`}
                class="flex items-center gap-3 px-2 py-2.5 hover:bg-zinc-800/50 rounded-lg transition-colors"
                onclick={onclose}
              >
                <img
                  src={result.thumbnail}
                  alt={result.title}
                  width="48"
                  height="64"
                  loading="lazy"
                  decoding="async"
                  sizes="48px"
                  class="w-12 h-16 rounded object-cover shrink-0 [filter:brightness(0.9)]"
                />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-zinc-100 leading-snug line-clamp-1">{result.title}</p>
                  <p class="text-xs text-zinc-400 mt-0.5">{result.status}</p>
                  {#if result.genres}
                    <p class="text-xs text-zinc-500 mt-0.5 line-clamp-1">{result.genres}</p>
                  {/if}
                </div>
              </a>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

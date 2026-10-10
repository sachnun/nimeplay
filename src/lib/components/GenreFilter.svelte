<script lang="ts">
  import type { Genre } from '#lib/shared/types'
  import { getContinueWatching } from '#lib/storage'
  import { onMount } from 'svelte'
  import { slide } from 'svelte/transition'

  let { genres, selectedGenre, onsearch, onsignin }: {
    genres: Genre[]
    selectedGenre: Genre | null
    onsearch: () => void
    onsignin: () => void
  } = $props()

  let scrollEl: HTMLDivElement | null = $state(null)
  let menuButtonEl: HTMLButtonElement | null = $state(null)
  let menuEl: HTMLDivElement | null = $state(null)
  let menuOpen = $state(false)
  let menuStyle = $state<Record<string, string>>({})
  let hasMoreLeft = $state(false)
  let hasMoreRight = $state(false)
  let hasHistory = $state(false)

  function positionMenu() {
    if (!menuButtonEl) return
    const rect = menuButtonEl.getBoundingClientRect()
    menuStyle = { top: `${rect.bottom + 8}px`, left: `${rect.left}px` }
  }

  function toggleMenu() {
    menuOpen = !menuOpen
    if (menuOpen) positionMenu()
  }

  function onScroll() {
    if (menuOpen) positionMenu()
    updateOverflow()
  }

  function updateOverflow() {
    const el = scrollEl
    if (!el) return
    hasMoreLeft = el.scrollLeft > 1
    hasMoreRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
  }

  function onClickOutside(event: MouseEvent) {
    if (!menuOpen) return
    const target = event.target as Node
    if (menuEl?.contains(target) || menuButtonEl?.contains(target)) return
    menuOpen = false
  }

  let dragging = false
  let moved = false
  let startX = 0
  let startScroll = 0

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    if (!scrollEl) return
    dragging = true
    moved = false
    startX = e.clientX
    startScroll = scrollEl.scrollLeft
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || !scrollEl) return
    const dx = e.clientX - startX
    if (!moved && Math.abs(dx) > 4) {
      moved = true
      scrollEl.setPointerCapture(e.pointerId)
    }
    if (moved) scrollEl.scrollLeft = startScroll - dx
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging) return
    dragging = false
    if (scrollEl?.hasPointerCapture(e.pointerId)) scrollEl.releasePointerCapture(e.pointerId)
  }

  function onClickCapture(e: MouseEvent) {
    if (!moved) return
    moved = false
    e.preventDefault()
    e.stopPropagation()
  }

  function onWheel(e: WheelEvent) {
    if (!scrollEl) return
    const max = scrollEl.scrollWidth - scrollEl.clientWidth
    if (max <= 0) return
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    if (delta === 0) return
    e.preventDefault()
    scrollEl.scrollLeft = Math.min(max, Math.max(0, scrollEl.scrollLeft + delta))
    if (menuOpen) positionMenu()
  }

  function centerSelected(behavior: ScrollBehavior = 'smooth') {
    const el = scrollEl
    if (!el) return
    const active = el.querySelector<HTMLElement>('[data-active="true"]')
    if (!active) return
    const elRect = el.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    const left = el.scrollLeft + (activeRect.left - elRect.left) - (el.clientWidth - activeRect.width) / 2
    const max = el.scrollWidth - el.clientWidth
    el.scrollTo({ left: Math.max(0, Math.min(max, left)), behavior })
  }

  let observer: ResizeObserver | null = null

  async function syncHistoryVisibility() {
    try {
      hasHistory = (await getContinueWatching()).length > 0
    } catch {
      hasHistory = false
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') void syncHistoryVisibility()
    if (menuOpen) positionMenu()
    updateOverflow()
  }

  $effect(() => {
    void selectedGenre?.slug
    void Promise.resolve().then(() => centerSelected())
  })

  $effect(() => {
    void genres.length
    void Promise.resolve().then(updateOverflow)
  })

  onMount(() => {
    if (scrollEl) {
      scrollEl.addEventListener('wheel', onWheel, { passive: false })
      observer = new ResizeObserver(updateOverflow)
      observer.observe(scrollEl)
    }
    document.addEventListener('click', onClickOutside)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('resize', onVisibility)
    void syncHistoryVisibility()
    requestAnimationFrame(() => {
      centerSelected('auto')
      updateOverflow()
    })
    return () => {
      scrollEl?.removeEventListener('wheel', onWheel)
      observer?.disconnect()
      document.removeEventListener('click', onClickOutside)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onVisibility)
    }
  })
</script>

{#if genres.length > 0}
  <div class="mb-6 select-none relative">
    <div
      bind:this={scrollEl}
      data-genre-scroll
      role="presentation"
      class="flex gap-2 overflow-x-auto pt-8 pr-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch]"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      onscroll={onScroll}
      ondragstart={e => e.preventDefault()}
      onclickcapture={onClickCapture}
    >
      <button
        bind:this={menuButtonEl}
        type="button"
        class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 cursor-pointer {menuOpen ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'}"
        title="Menu"
        aria-label="Menu"
        onclick={toggleMenu}
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {#if hasHistory}
        <a
          href="/history"
          title="History"
          aria-label="History"
          draggable="false"
          transition:slide={{ axis: 'x', duration: 250 }}
          class="px-3 py-1.5 rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors shrink-0 flex items-center [-webkit-user-drag:none]"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3v5h5" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 7v5l4 2" />
          </svg>
        </a>
      {/if}
      {#each genres as genre (genre.slug)}
        <a
          href={selectedGenre?.slug === genre.slug ? '/' : `/${genre.slug}`}
          draggable="false"
          data-active={selectedGenre?.slug === genre.slug ? 'true' : undefined}
          aria-current={selectedGenre?.slug === genre.slug ? 'true' : undefined}
          class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer [-webkit-user-drag:none] {selectedGenre?.slug === genre.slug ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'}"
        >
          {genre.name}
        </a>
      {/each}
    </div>

    {#if hasMoreLeft}
      <div class="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent" aria-hidden="true"></div>
    {/if}
    {#if hasMoreRight}
      <div class="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" aria-hidden="true"></div>
    {/if}

    {#if menuOpen}
      <div
        bind:this={menuEl}
        class="fixed w-40 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-2 z-50"
        style:top={menuStyle.top}
        style:left={menuStyle.left}
        role="presentation"
        onclick={() => (menuOpen = false)}
      >
        <button
          class="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          onclick={onsearch}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Search
        </button>
        <button
          class="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          onclick={onsignin}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Sign In
        </button>
        <a
          href="/docs"
          target="_blank"
          rel="noopener"
          class="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          API Docs
          <svg class="w-3 h-3 ml-auto opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    {/if}
  </div>
{/if}

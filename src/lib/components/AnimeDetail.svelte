<script lang="ts">
  import type { AnimeCharacter, OtakudesuInfo } from '#lib/types'
  import { goto } from '$app/navigation'
  import CharacterList from './CharacterList.svelte'
  import EpisodeList from './EpisodeList.svelte'
  import SynopsisSection from './SynopsisSection.svelte'

  let {
    malId,
    title,
    thumbnail,
    genres,
    otakudesu,
    episodes,
    synopsis,
    characters,
    hideBack = false,
  }: {
    malId: number
    title: string
    japaneseTitle?: string
    thumbnail: string
    genres: { name: string; slug: string }[]
    otakudesu: OtakudesuInfo
    episodes: number[]
    synopsis: string
    characters: AnimeCharacter[]
    hideBack?: boolean
  } = $props()

  const infoItems = $derived(
    [
      { label: 'Status', value: otakudesu.status },
      { label: 'Studio', value: otakudesu.studio },
    ].filter(item => item.value),
  )

  let headerRef: HTMLElement | null = $state(null)
  let episodesPanelRef: HTMLElement | null = $state(null)
  let episodesListRef: HTMLElement | null = $state(null)
  let synopsisRef: HTMLElement | null = $state(null)
  let charactersRef: HTMLElement | null = $state(null)
  let synopsisBeside = $state(false)
  let charactersBeside = $state(false)

  function naturalEpisodesHeight(list: HTMLElement) {
    const grid = list.querySelector<HTMLElement>('[data-episode-grid]')
    if (!grid) return list.scrollHeight
    const previous = grid.style.contentVisibility
    grid.style.contentVisibility = 'visible'
    const height = list.scrollHeight
    grid.style.contentVisibility = previous
    return height
  }

  function updateEpisodesReach() {
    const panel = episodesPanelRef
    const list = episodesListRef
    const synopsisEl = synopsisRef
    const charactersEl = charactersRef
    if (!panel || !list || !synopsisEl) return
    const height = naturalEpisodesHeight(list)
    if (height === 0) return
    const panelTop = panel.getBoundingClientRect().top
    const headingHeight = list.getBoundingClientRect().top - panelTop
    const episodesBottom = panelTop + headingHeight + height
    synopsisBeside = episodesBottom > synopsisEl.getBoundingClientRect().top
    charactersBeside = charactersEl ? episodesBottom > charactersEl.getBoundingClientRect().top : false
  }

  function goBack() {
    if (window.history.state?.back) history.back()
    else void goto('/')
  }

  $effect(() => {
    void episodes.length
    void Promise.resolve().then(updateEpisodesReach)
  })

  $effect(() => {
    const observer = new ResizeObserver(updateEpisodesReach)
    if (headerRef) observer.observe(headerRef)
    if (synopsisRef) observer.observe(synopsisRef)
    void Promise.resolve().then(updateEpisodesReach)
    void document.fonts?.ready.then(() => updateEpisodesReach())
    return () => observer.disconnect()
  })
</script>

<div class="relative overflow-hidden min-h-full">
  <div class="absolute inset-0 z-0 overflow-hidden">
    <img
      src={thumbnail}
      alt=""
      aria-hidden="true"
      width="400"
      height="533"
      loading="lazy"
      decoding="async"
      fetchpriority="low"
      class="w-full h-full object-cover scale-105 blur-xl opacity-15 pointer-events-none transform-gpu will-change-transform [contain:strict]"
    />
  </div>
  <div
    class="absolute inset-0 z-[1] bg-[linear-gradient(to_bottom,rgba(0,0,0,0.2)_0%,rgba(0,0,0,0.35)_15%,rgba(0,0,0,0.55)_30%,rgba(0,0,0,0.75)_45%,rgba(0,0,0,0.9)_60%,rgba(0,0,0,1)_75%)] lg:bg-[linear-gradient(to_bottom,rgba(0,0,0,0.15)_0%,rgba(0,0,0,0.3)_15%,rgba(0,0,0,0.45)_30%,rgba(0,0,0,0.6)_45%,rgba(0,0,0,0.8)_60%,rgba(0,0,0,0.95)_75%,rgba(0,0,0,1)_85%)]"
  ></div>

  <div class="relative z-10">
    <section class="max-w-screen-2xl mx-auto {hideBack ? 'px-4 sm:px-6 py-6' : 'px-6 py-8'}">
      {#if !hideBack}
        <div class="mb-4">
          <button
            type="button"
            class="inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-white/15 text-zinc-200 hover:bg-white/25 transition-colors w-fit cursor-pointer"
            onclick={goBack}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            Back
          </button>
        </div>
      {/if}
      <div class="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] md:gap-8 xl:gap-10">
        <div bind:this={headerRef} class="flex min-w-0 items-start gap-4 md:col-start-1 md:row-start-1">
          <img
            src={thumbnail}
            alt={title}
            width="300"
            height="400"
            loading="eager"
            fetchpriority="high"
            decoding="async"
            class="flex-shrink-0 w-32 sm:w-40 lg:w-48 xl:w-56 rounded-lg shadow-2xl shadow-black/50 h-auto [filter:brightness(0.9)]"
          />
          <div class="flex-1 min-w-0">
            <h1 class="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-zinc-100 leading-tight">{title}</h1>
            <div class="flex flex-wrap gap-1.5 mt-3">
              {#each genres as genre (genre.slug)}
                <a
                  href={`/${genre.slug}`}
                  class="text-xs px-2 py-0.5 rounded-full bg-white/15 text-zinc-200 hover:bg-white/25 transition-colors"
                >
                  {genre.name}
                </a>
              {/each}
            </div>
            <div class="flex items-center gap-1.5 mt-2 text-xs text-zinc-400 md:hidden">
              {#each [otakudesu.studio].filter(Boolean) as text, i (text)}
                {#if i > 0}<span class="w-1 h-1 rounded-full bg-zinc-500 shrink-0"></span>{/if}
                <span>{text}</span>
              {/each}
            </div>
            <div class="hidden md:block md:mt-5">
              <section>
                <div class="flex flex-wrap gap-x-8 gap-y-3 text-sm">
                  {#each infoItems as item (item.label)}
                    <div class="flex justify-between gap-2 sm:block">
                      <span class="text-zinc-400 text-xs uppercase tracking-wide [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">{item.label}</span>
                      <span class="sm:ml-0 sm:block text-zinc-100 text-sm [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">{item.value}</span>
                    </div>
                  {/each}
                </div>
              </section>
            </div>
          </div>
        </div>

        <div class="md:hidden">
          <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">Episodes</h2>
          <EpisodeList {episodes} {malId} />
        </div>

        <div
          class="hidden md:relative md:block md:col-start-2 md:row-start-1 {charactersBeside ? 'md:row-span-3' : synopsisBeside ? 'md:row-span-2' : ''}"
        >
          <div bind:this={episodesPanelRef} class="flex flex-col md:absolute md:inset-x-0 md:top-0 md:max-h-full">
            <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3 shrink-0">Episodes</h2>
            <div bind:this={episodesListRef} class="min-h-0 flex-1 overflow-y-auto">
              <EpisodeList {episodes} {malId} />
            </div>
          </div>
        </div>

        <div
          bind:this={synopsisRef}
          class="min-w-0 md:row-start-2 {synopsisBeside ? 'md:col-start-1' : 'md:col-span-2'}"
        >
          <SynopsisSection {synopsis} />
        </div>

        {#if characters && characters.length > 0}
          <div
            bind:this={charactersRef}
            class="min-w-0 md:row-start-3 {charactersBeside ? 'md:col-start-1' : 'md:col-span-2'}"
          >
            <CharacterList {characters} />
          </div>
        {/if}
      </div>
    </section>
  </div>
</div>

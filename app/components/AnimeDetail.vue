<script setup lang="ts">
import type { AnimeCharacter, OtakudesuInfo } from '~/utils/types'

const props = defineProps<{
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
}>()

const infoItems = computed(() => [
  { label: 'Status', value: props.otakudesu.status },
  { label: 'Type', value: props.otakudesu.type },
  { label: 'Studio', value: props.otakudesu.studio },
  { label: 'Source', value: props.otakudesu.source },
].filter((item) => item.value))

const headerRef = ref<HTMLElement | null>(null)
const episodesPanelRef = ref<HTMLElement | null>(null)
const episodesListRef = ref<HTMLElement | null>(null)
const synopsisRef = ref<HTMLElement | null>(null)
const charactersRef = ref<HTMLElement | null>(null)
const synopsisBeside = ref(false)
const charactersBeside = ref(false)

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
  const panel = episodesPanelRef.value
  const list = episodesListRef.value
  const synopsis = synopsisRef.value
  const characters = charactersRef.value
  if (!panel || !list || !synopsis) return
  const height = naturalEpisodesHeight(list)
  if (height === 0) return
  const panelTop = panel.getBoundingClientRect().top
  const headingHeight = list.getBoundingClientRect().top - panelTop
  const episodesBottom = panelTop + headingHeight + height
  synopsisBeside.value = episodesBottom > synopsis.getBoundingClientRect().top
  charactersBeside.value = characters ? episodesBottom > characters.getBoundingClientRect().top : false
}

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  resizeObserver = new ResizeObserver(updateEpisodesReach)
  if (headerRef.value) resizeObserver.observe(headerRef.value)
  if (synopsisRef.value) resizeObserver.observe(synopsisRef.value)
  void nextTick(updateEpisodesReach)
  void document.fonts?.ready.then(() => updateEpisodesReach())
})
onBeforeUnmount(() => resizeObserver?.disconnect())

watch(() => props.episodes.length, () => void nextTick(updateEpisodesReach))

const router = useRouter()

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/')
  }
}
</script>

<template>
  <div class="relative overflow-hidden">
    <div class="absolute inset-0 z-0 overflow-hidden">
      <img :src="thumbnail" alt="" aria-hidden="true" width="400" height="533" loading="lazy" decoding="async" fetchpriority="low" class="w-full h-full object-cover scale-105 blur-xl opacity-15 pointer-events-none transform-gpu will-change-transform [contain:strict]">
    </div>
    <div class="absolute inset-0 z-[1] bg-[linear-gradient(to_bottom,rgba(0,0,0,0.2)_0%,rgba(0,0,0,0.35)_15%,rgba(0,0,0,0.55)_30%,rgba(0,0,0,0.75)_45%,rgba(0,0,0,0.9)_60%,rgba(0,0,0,1)_75%)] lg:bg-[linear-gradient(to_bottom,rgba(0,0,0,0.15)_0%,rgba(0,0,0,0.3)_15%,rgba(0,0,0,0.45)_30%,rgba(0,0,0,0.6)_45%,rgba(0,0,0,0.8)_60%,rgba(0,0,0,0.95)_75%,rgba(0,0,0,1)_85%)]" />

    <div class="relative z-10">
      <section class="max-w-screen-2xl mx-auto" :class="hideBack ? 'px-4 sm:px-6 py-6' : 'px-6 py-8'">
        <div v-if="!hideBack" class="mb-4">
          <button type="button" class="inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-white/15 text-zinc-200 hover:bg-white/25 transition-colors w-fit cursor-pointer" @click="goBack">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            Back
          </button>
        </div>
        <div class="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] md:gap-8 xl:gap-10">
          <div ref="headerRef" class="flex min-w-0 items-start gap-4 md:col-start-1 md:row-start-1">
            <img :src="thumbnail" :alt="title" width="300" height="400" loading="eager" fetchpriority="high" decoding="async" class="flex-shrink-0 w-32 sm:w-40 lg:w-48 xl:w-56 rounded-lg shadow-2xl shadow-black/50 h-auto [filter:brightness(0.9)]">
            <div class="flex-1 min-w-0">
              <h1 class="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-zinc-100 leading-tight">{{ title }}</h1>
              <div class="flex flex-wrap gap-1.5 mt-3">
                <NuxtLink v-for="genre in genres" :key="genre.slug" :to="`/${genre.slug}`" replace class="text-xs px-2 py-0.5 rounded-full bg-white/15 text-zinc-200 hover:bg-white/25 transition-colors">
                  {{ genre.name }}
                </NuxtLink>
              </div>
              <div class="flex items-center gap-1.5 mt-2 text-xs text-zinc-400 md:hidden">
                <template v-for="(text, i) in [otakudesu.studio].filter(Boolean)" :key="text">
                  <span v-if="i > 0" class="w-1 h-1 rounded-full bg-zinc-500 shrink-0" />
                  <span>{{ text }}</span>
                </template>
              </div>
              <div class="hidden md:block md:mt-5">
                <section>
                  <div class="flex flex-wrap gap-x-8 gap-y-3 text-sm">
                    <div v-for="item in infoItems" :key="item.label" class="flex justify-between gap-2 sm:block">
                      <span class="text-zinc-400 text-xs uppercase tracking-wide [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">{{ item.label }}</span>
                      <span class="sm:ml-0 sm:block text-zinc-100 text-sm [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">{{ item.value }}</span>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>

          <div class="md:hidden">
            <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Episodes
            </h2>
            <EpisodeList :episodes="episodes" :mal-id="malId" />
          </div>

          <div
            class="hidden md:relative md:block md:col-start-2 md:row-start-1"
            :class="charactersBeside ? 'md:row-span-3' : synopsisBeside ? 'md:row-span-2' : ''"
          >
            <div ref="episodesPanelRef" class="flex flex-col md:absolute md:inset-x-0 md:top-0 md:max-h-full">
              <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3 shrink-0">
                Episodes
              </h2>
              <div ref="episodesListRef" class="min-h-0 flex-1 overflow-y-auto">
                <EpisodeList :episodes="episodes" :mal-id="malId" />
              </div>
            </div>
          </div>

          <div
            ref="synopsisRef"
            class="min-w-0 md:row-start-2"
            :class="synopsisBeside ? 'md:col-start-1' : 'md:col-span-2'"
          >
            <SynopsisSection :synopsis="synopsis" />
          </div>

          <div
            v-if="characters && characters.length > 0"
            ref="charactersRef"
            class="min-w-0 md:row-start-3"
            :class="charactersBeside ? 'md:col-start-1' : 'md:col-span-2'"
          >
            <CharacterList :characters="characters" />
          </div>
        </div>
      </section>
    </div>

  </div>
</template>

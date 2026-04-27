<script setup lang="ts">
import type { OtakudesuInfo } from '~/utils/types'

const props = defineProps<{
  animeSlug: string
  title: string
  japaneseTitle?: string
  thumbnail: string
  genres: { name: string; slug: string }[]
  synopsisId?: string
  otakudesu: OtakudesuInfo
  episodes: { title: string; slug: string }[]
}>()

const { data, loading } = useJikanData(toRef(props, 'animeSlug'), toRef(props, 'title'), toRef(props, 'japaneseTitle'))
const posterOpen = ref(false)

function closePoster() {
  posterOpen.value = false
}

watch(posterOpen, (open) => {
  if (!import.meta.client) return
  document.body.style.overflow = open ? 'hidden' : ''
})

onMounted(() => {
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closePoster()
  }
  window.addEventListener('keydown', onKey)
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
    document.body.style.overflow = ''
  })
})
</script>

<template>
  <div class="min-h-screen relative overflow-hidden">
    <div class="absolute inset-0 z-0">
      <img :src="thumbnail" alt="" width="1200" height="1600" loading="lazy" class="w-full h-full object-cover scale-110 blur-3xl opacity-15">
    </div>
    <TrailerBackground :trailer-embed-url="data?.trailerEmbedUrl" />
    <div class="absolute inset-0 z-[1] bg-[linear-gradient(to_bottom,rgba(0,0,0,0.2)_0%,rgba(0,0,0,0.35)_15%,rgba(0,0,0,0.55)_30%,rgba(0,0,0,0.75)_45%,rgba(0,0,0,0.9)_60%,rgba(0,0,0,1)_75%)] lg:bg-[linear-gradient(to_bottom,rgba(0,0,0,0.15)_0%,rgba(0,0,0,0.3)_15%,rgba(0,0,0,0.45)_30%,rgba(0,0,0,0.6)_45%,rgba(0,0,0,0.8)_60%,rgba(0,0,0,0.95)_75%,rgba(0,0,0,1)_85%)]" />

    <div class="relative z-10">
      <section class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 lg:py-10">
        <div class="flex flex-col lg:grid lg:grid-cols-[auto_1fr_minmax(280px,360px)] lg:gap-8 xl:gap-10 gap-5">
          <div class="flex gap-4 lg:block">
            <button type="button" class="flex-shrink-0 cursor-pointer rounded-lg overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50" @click="posterOpen = true">
              <img :src="thumbnail" :alt="title" width="300" height="400" loading="eager" class="w-32 sm:w-40 lg:w-48 xl:w-56 rounded-lg shadow-2xl shadow-black/50 h-auto">
            </button>
            <div class="lg:hidden flex-1 min-w-0">
              <h1 class="text-xl sm:text-2xl font-bold text-zinc-100 leading-tight">{{ title }}</h1>
              <div class="flex flex-wrap gap-1.5 mt-3">
                <GenreLink v-for="genre in genres" :key="genre.slug" :name="genre.name" :slug="genre.slug" />
              </div>
              <div class="flex items-center gap-1.5 mt-2 text-xs text-zinc-400">
                <template v-for="(text, i) in [otakudesu.status, otakudesu.studio].filter(Boolean)" :key="text">
                  <span v-if="i > 0" class="text-zinc-500">.</span>
                  <span>{{ text }}</span>
                </template>
              </div>
            </div>
          </div>

          <div class="min-w-0">
            <div class="hidden lg:block">
              <h1 class="text-2xl lg:text-3xl xl:text-4xl font-bold text-zinc-100 leading-tight">{{ title }}</h1>
              <div class="flex flex-wrap gap-2 mt-3">
                <GenreLink v-for="genre in genres" :key="genre.slug" :name="genre.name" :slug="genre.slug" />
              </div>
            </div>
            <div class="hidden lg:block lg:mt-5">
              <InfoSection :otakudesu="otakudesu" :jikan="data" :loading="loading" />
            </div>
            <div class="lg:hidden mt-4">
              <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Episodes
                <span v-if="episodes.length > 1" class="ml-2 text-zinc-600 font-normal">({{ episodes.length }})</span>
              </h2>
              <EpisodeList :episodes="episodes" :anime-slug="animeSlug" />
            </div>
          </div>

          <div class="hidden lg:block">
            <div class="bg-zinc-900/50 backdrop-blur rounded-lg p-4">
              <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Episodes
                <span v-if="episodes.length > 1" class="ml-2 text-zinc-600 font-normal">({{ episodes.length }})</span>
              </h2>
              <EpisodeList :episodes="episodes" :anime-slug="animeSlug" scrollable />
            </div>
          </div>
        </div>
      </section>

      <div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 lg:py-8">
        <div class="grid grid-cols-1 lg:grid-cols-[1fr_minmax(280px,400px)] gap-6 lg:gap-8 xl:gap-10">
          <div class="space-y-6 lg:space-y-8 min-w-0">
            <SynopsisSection :synopsis-id="synopsisId" :synopsis-en="data?.synopsisEn" :loading="loading" />
          </div>
          <div>
            <CharactersSection :characters="data?.characters" :loading="loading" />
          </div>
        </div>
      </div>
    </div>

    <div v-if="posterOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm" @click="closePoster">
      <button type="button" class="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 cursor-pointer" aria-label="Close preview" @click="closePoster">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <div class="relative max-w-[90vw] max-h-[90vh]" @click.stop>
        <img :src="thumbnail" :alt="title" width="600" height="800" loading="eager" class="max-h-[90vh] w-auto rounded-lg shadow-2xl object-contain">
      </div>
    </div>
  </div>
</template>

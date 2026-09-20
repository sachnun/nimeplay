<script setup lang="ts">
import type { OtakudesuInfo } from '~/utils/types'

const props = defineProps<{
  malId: number
  title: string
  japaneseTitle?: string
  thumbnail: string
  genres: { name: string; slug: string }[]
  otakudesu: OtakudesuInfo
  episodes: number[]
  hideBack?: boolean
}>()

const { data, loading } = useAnimeMetadata(toRef(props, 'malId'))
const infoItems = computed(() => [
  { label: 'Status', value: props.otakudesu.status },
  { label: 'Type', value: props.otakudesu.type },
  { label: 'Studio', value: props.otakudesu.studio },
  { label: 'Source', value: props.otakudesu.source },
].filter((item) => item.value))

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
      <section class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 lg:py-10">
        <button v-if="!hideBack" type="button" class="inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-white/15 text-zinc-200 hover:bg-white/25 transition-colors mb-4 w-fit cursor-pointer" @click="goBack">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Back
        </button>
        <div class="hidden md:block md:float-right md:w-[360px] md:ml-8 xl:ml-10">
          <div class="bg-zinc-900/50 backdrop-blur rounded-lg p-4">
            <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Episodes
            </h2>
            <EpisodeList :episodes="episodes" :mal-id="malId" />
          </div>
        </div>

        <div class="md:flow-root">
          <div class="flex gap-4">
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
        </div>

        <div class="md:hidden mt-6">
          <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Episodes
          </h2>
          <EpisodeList :episodes="episodes" :mal-id="malId" />
        </div>

        <div class="mt-6 md:flow-root">
          <div class="flex flex-col gap-6">
            <SynopsisSection :synopsis="data?.synopsis" :loading="loading" />
            <CharacterList :characters="data?.characters" />
          </div>
        </div>

        <div class="hidden md:block md:clear-both" />
      </section>
    </div>

  </div>
</template>

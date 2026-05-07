<script setup lang="ts">
import type { TrpcOutputs } from '~/types/trpc'

type AnimeDetail = NonNullable<TrpcOutputs['anime']>

const route = useRoute()
const slug = computed(() => String(route.params.slug || ''))
const isEpisodeRoute = computed(() => Boolean(route.params.episode))
const trpc = useTrpc()

const { data: anime, pending } = await useAsyncData<AnimeDetail | null>(
  () => `anime-detail-${slug.value}`,
  async () => {
    if (isEpisodeRoute.value) return null
    return trpc.anime.query({ slug: slug.value })
  },
  { watch: [slug, isEpisodeRoute] },
)

if (!isEpisodeRoute.value && !anime.value) {
  await navigateTo('/')
}

watchEffect(() => {
  if (!isEpisodeRoute.value && !pending.value && !anime.value) navigateTo('/')
  if (anime.value?.title) useHead({ title: anime.value.title })
})
</script>

<template>
  <NuxtPage v-if="isEpisodeRoute" />
  <div v-else-if="pending || !anime" class="min-h-screen relative overflow-hidden bg-black">
    <div class="absolute inset-0 z-0 bg-zinc-900/50" />
    <div class="relative z-10">
      <section class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 lg:py-10">
        <div class="flex flex-col lg:grid lg:grid-cols-[auto_1fr_minmax(280px,360px)] lg:gap-8 xl:gap-10 gap-5">
          <div class="flex gap-4 lg:block">
            <div class="w-32 sm:w-40 lg:w-48 xl:w-56 aspect-[3/4] rounded-lg bg-zinc-800 animate-pulse flex-shrink-0" />
            <div class="lg:hidden flex-1 min-w-0 space-y-3">
              <div class="h-6 w-3/4 bg-zinc-800 rounded animate-pulse" />
              <div class="flex gap-1.5">
                <div v-for="i in 3" :key="i" class="h-5 w-14 bg-zinc-800 rounded-full animate-pulse" />
              </div>
              <div class="h-3 w-1/3 bg-zinc-800 rounded animate-pulse" />
            </div>
          </div>
          <div class="min-w-0">
            <div class="hidden lg:block space-y-3">
              <div class="h-8 w-2/3 bg-zinc-800 rounded animate-pulse" />
              <div class="flex gap-2">
                <div v-for="i in 4" :key="i" class="h-5 w-16 bg-zinc-800 rounded-full animate-pulse" />
              </div>
            </div>
            <div class="hidden lg:block lg:mt-5">
              <div class="h-3.5 w-20 bg-zinc-800 rounded animate-pulse mb-3" />
              <div class="flex flex-wrap gap-x-8 gap-y-3">
                <div v-for="i in 5" :key="i" class="space-y-1">
                  <div class="h-3 bg-zinc-800 rounded w-12 animate-pulse" />
                  <div class="h-4 bg-zinc-800 rounded w-16 animate-pulse" />
                </div>
              </div>
            </div>
            <div class="lg:hidden mt-4">
              <div class="h-3.5 w-16 bg-zinc-800 rounded animate-pulse mb-2" />
              <div class="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2">
                <div v-for="i in 12" :key="i" class="h-9 bg-zinc-800/60 rounded animate-pulse" />
              </div>
            </div>
          </div>
          <div class="hidden lg:block">
            <div class="bg-zinc-900/50 rounded-lg p-4">
              <div class="flex items-center gap-2 mb-3">
                <div class="h-3.5 w-16 bg-zinc-800 rounded animate-pulse" />
                <div class="h-3 w-8 bg-zinc-800/40 rounded animate-pulse" />
              </div>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2">
                <div v-for="i in 12" :key="i" class="h-9 bg-zinc-800/60 rounded animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </section>
      <div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 lg:py-8">
        <div class="grid grid-cols-1 lg:grid-cols-[1fr_minmax(280px,400px)] gap-6 lg:gap-8 xl:gap-10">
          <div class="space-y-3">
            <div class="h-3.5 w-16 bg-zinc-800 rounded animate-pulse" />
            <div class="space-y-2">
              <div class="h-3 w-full bg-zinc-800 rounded animate-pulse" />
              <div class="h-3 w-5/6 bg-zinc-800 rounded animate-pulse" />
              <div class="h-3 w-4/6 bg-zinc-800 rounded animate-pulse hidden lg:block" />
              <div class="h-3 w-5/6 bg-zinc-800 rounded animate-pulse hidden lg:block" />
            </div>
          </div>
          <div class="space-y-3">
            <div class="h-3.5 w-20 bg-zinc-800 rounded animate-pulse" />
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              <div v-for="i in 6" :key="i" class="flex items-center gap-2.5" :class="i >= 4 ? 'hidden sm:flex' : ''">
                <div class="w-10 h-10 bg-zinc-800 rounded-full flex-shrink-0 animate-pulse" />
                <div class="space-y-1 flex-1">
                  <div class="h-3 bg-zinc-800 rounded w-2/3 animate-pulse" />
                  <div class="h-2.5 bg-zinc-800 rounded w-1/2 animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <AnimeDetailContent
    v-else
    :anime-slug="slug"
    :title="anime.title"
    :japanese-title="anime.japanese || undefined"
    :thumbnail="anime.thumbnail"
    :genres="anime.genres"
    :synopsis-id="anime.synopsis || undefined"
    :otakudesu="{
      score: anime.score,
      status: anime.status,
      type: anime.type,
      totalEpisode: anime.totalEpisode,
      duration: anime.duration,
      studio: anime.studio,
      releaseDate: anime.releaseDate,
    }"
    :episodes="anime.episodes"
    :mal="{
      malId: anime.malId,
      synopsisEn: anime.synopsis || '',
      background: anime.background || '',
      malScore: anime.score ? Number(anime.score) : null,
      malRank: anime.malRank,
      popularity: anime.popularity,
      rating: anime.rating,
      season: anime.season,
      year: anime.year,
      trailerEmbedUrl: anime.trailerEmbedUrl,
      characters: anime.characters || [],
    }"
    :characters="anime.characters || []"
  />
</template>

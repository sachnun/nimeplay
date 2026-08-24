<script setup lang="ts">
import type { AnimeCard, Genre } from '~/utils/types'

withDefaults(defineProps<{
  ongoingData: { anime: AnimeCard[]; totalPages: number }
  completedData: { anime: AnimeCard[]; totalPages: number }
  genres: Genre[]
  isLoading?: boolean
}>(), {
  isLoading: false,
})

const selectedGenre = useState<Genre | null>('selected-genre', () => null)
const searchOpen = ref(false)
</script>

<template>
  <GenreFilter :genres="genres" :selected-genre="selectedGenre" @select="selectedGenre = $event" @search="searchOpen = true" @sign-in="searchOpen = false" />

  <section v-if="isLoading">
    <div class="grid grid-cols-2 sm:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] gap-4">
      <div v-for="i in 18" :key="i" class="rounded-lg overflow-hidden bg-card animate-pulse">
        <div class="relative aspect-[3/4] bg-zinc-900">
          <div class="absolute bottom-0 left-0 right-0 p-3">
            <div class="h-4 w-3/4 bg-white/10 rounded mb-2" />
            <div class="h-3 w-1/2 bg-white/10 rounded" />
          </div>
        </div>
      </div>
    </div>
  </section>
  <section v-else-if="selectedGenre">
    <GenreAnimeGrid :key="selectedGenre.slug" :genre-slug="selectedGenre.slug" />
  </section>
  <section v-else>
    <AnimeInfiniteGrid
      page-type="ONGOING"
      :initial-data="ongoingData"
      next-page-type="COMPLETED"
      :next-initial-data="completedData"
      :next-show-day="false"
    />
  </section>

  <SearchBar :open="searchOpen" @close="searchOpen = false" />
</template>

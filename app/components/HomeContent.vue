<script setup lang="ts">
import type { AnimeCard, Genre } from '~/utils/types'

defineProps<{
  ongoingData: { anime: AnimeCard[]; totalPages: number }
  completedData: { anime: AnimeCard[]; totalPages: number }
  genres: Genre[]
}>()

const selectedGenre = useState<Genre | null>('selected-genre', () => null)
const searchOpen = ref(false)
</script>

<template>
  <GenreFilter :genres="genres" :selected-genre="selectedGenre" @select="selectedGenre = $event" @search="searchOpen = true" @sign-in="searchOpen = false" />

  <section v-if="selectedGenre">
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

<script setup lang="ts">
import type { AnimeCard, Genre } from '~/utils/types'

interface HomeData {
  ongoingData: { anime: AnimeCard[]; totalPages: number }
  completedData: { anime: AnimeCard[]; totalPages: number }
  genres: Genre[]
}

useHead({ title: 'Nimeplay', titleTemplate: '%s' })

const { data } = await useAsyncData<HomeData>('home', async () => {
  return $fetch('/api/home')
}, {
  default: () => ({
    ongoingData: { anime: [], totalPages: 1 },
    completedData: { anime: [], totalPages: 1 },
    genres: [],
  }),
})

const selectedGenre = useState<Genre | null>('selected-genre', () => null)
const searchOpen = ref(false)
</script>

<template>
  <main class="px-6 py-8">
    <GenreFilter :genres="data.genres" :selected-genre="selectedGenre" @select="selectedGenre = $event" @search="searchOpen = true" @sign-in="searchOpen = false" />

    <section v-if="selectedGenre">
      <GenreAnimeGrid :key="selectedGenre.slug" :genre-slug="selectedGenre.slug" />
    </section>
    <section v-else>
      <AnimeInfiniteGrid
        page-type="ONGOING"
        :initial-data="data.ongoingData"
        next-page-type="COMPLETED"
        :next-initial-data="data.completedData"
        :next-show-day="false"
      />
    </section>

    <SearchBar :open="searchOpen" @close="searchOpen = false" />
  </main>
</template>

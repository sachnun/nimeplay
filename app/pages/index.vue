<script setup lang="ts">
import type { AnimeCard, Genre } from '~/utils/types'

interface HomeData {
  ongoingData: { anime: AnimeCard[]; totalPages: number }
  completedData: { anime: AnimeCard[]; totalPages: number }
  genres: Genre[]
}

useHead({ title: 'Nimeplay', titleTemplate: '%s' })

const { data, pending } = await useAsyncData<HomeData>('home', async () => {
  return $fetch('/api/home')
}, {
  default: () => ({
    ongoingData: { anime: [], totalPages: 1 },
    completedData: { anime: [], totalPages: 1 },
    genres: [],
  }),
})
</script>

<template>
  <div class="px-6 py-8">
    <HomeContent
      :ongoing-data="data.ongoingData"
      :completed-data="data.completedData"
      :genres="data.genres"
      :is-loading="pending"
    />
  </div>
</template>

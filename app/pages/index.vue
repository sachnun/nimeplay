<script setup lang="ts">
import type { AnimeCard, Genre } from '~/types'

interface HomeData {
  ongoingData: { anime: AnimeCard[]; totalPages: number }
  completedData: { anime: AnimeCard[]; totalPages: number }
  genres: Genre[]
}

useHead({ title: 'Nimeplay', titleTemplate: '%s' })

definePageMeta({
  layout: 'browse',
  browse: true,
  scrollToTop: (_to, from) => !from.meta.browse,
})

const { data, error, status } = await useAsyncData<HomeData>('home', async () => {
  return $fetch('/api/home')
}, {
  default: () => ({
    ongoingData: { anime: [], totalPages: 1 },
    completedData: { anime: [], totalPages: 1 },
    genres: [],
  }),
})

const homeFailed = computed(() => status.value !== 'pending' && isServerError(error.value))
</script>

<template>
  <section v-if="homeFailed">
    <EmptyState />
  </section>
  <section v-else>
    <AnimeGrid
      page-type="ONGOING"
      :initial-data="data.ongoingData"
      next-page-type="COMPLETED"
      :next-initial-data="data.completedData"
      :next-show-day="false"
    />
  </section>
</template>

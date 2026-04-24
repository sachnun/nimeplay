<script setup lang="ts">
import type { AnimeCard, Genre } from '~/utils/types'

interface PageData {
  anime: AnimeCard[]
  totalPages: number
}

interface HomeData {
  ongoingData: PageData
  completedData: PageData
  genres: Genre[]
}

useHead({ title: 'Nimeplay' })

const route = useRoute()
const { selectedGenre, setSelectedGenre } = useGenre()

const { data, pending } = await useAsyncData<HomeData>('home', () => $fetch('/api/home'), {
  default: () => ({
    ongoingData: { anime: [], totalPages: 1 },
    completedData: { anime: [], totalPages: 1 },
    genres: [],
  }),
})

watch([() => route.query.genre, () => data.value.genres], ([genre]) => {
  const slug = typeof genre === 'string' ? genre : ''
  if (!slug) return
  const found = data.value.genres.find((g) => g.slug === slug)
  if (found && selectedGenre.value?.slug !== found.slug) setSelectedGenre(found)
}, { immediate: true })
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

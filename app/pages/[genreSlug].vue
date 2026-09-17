<script setup lang="ts">
import type { Genre } from '~/utils/types'

const route = useRoute()
const genreSlug = computed(() => String(route.params.genreSlug || '').toLowerCase())

const { data: genresData } = await useAsyncData<{ data: Genre[] }>('genres', () => $fetch('/api/v1/genres'), {
  default: () => ({ data: [] }),
})

const nuxtApp = useNuxtApp()
const homeGenres = computed<Genre[]>(() => (nuxtApp.payload.data.home as { genres?: Genre[] } | undefined)?.genres ?? [])
const genres = computed<Genre[]>(() => genresData.value.data.length > 0 ? genresData.value.data : homeGenres.value)
const selectedGenre = computed(() => genres.value.find((g) => g.slug === genreSlug.value) ?? null)

if (genres.value.length > 0 && !selectedGenre.value) {
  throw createError({ statusCode: 404, statusMessage: 'Genre not found' })
}

watch(selectedGenre, (genre) => {
  if (genres.value.length > 0 && !genre) showError(createError({ statusCode: 404, statusMessage: 'Genre not found' }))
})

watchEffect(() => {
  if (selectedGenre.value) useHead({ title: selectedGenre.value.name })
})

definePageMeta({
  browse: true,
  scrollToTop: (_to, from) => !from.meta.browse,
})

const searchOpen = ref(false)
</script>

<template>
  <div class="px-6 py-8">
    <GenreFilter :genres="genres" :selected-genre="selectedGenre" @search="searchOpen = true" @sign-in="searchOpen = false" />

    <section>
      <GenreAnimeGrid :key="genreSlug" :genre-slug="genreSlug" />
    </section>

    <SearchBar :open="searchOpen" @close="searchOpen = false" @open="searchOpen = true" />
  </div>
</template>

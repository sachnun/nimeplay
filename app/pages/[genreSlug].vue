<script setup lang="ts">
const route = useRoute()
const genreSlug = computed(() => String(route.params.genreSlug || '').toLowerCase())

const { genres, selectedGenre, ready } = useGenres()
await ready

if (genres.value.length > 0 && !selectedGenre.value) {
  throw createError({ status: 404, statusText: 'Genre not found' })
}

watch(selectedGenre, genre => {
  if (genres.value.length > 0 && !genre) showError(createError({ status: 404, statusText: 'Genre not found' }))
})

watchEffect(() => {
  if (selectedGenre.value) useHead({ title: selectedGenre.value.name })
})

definePageMeta({
  layout: 'browse',
  browse: true,
  scrollToTop: (_to, from) => !from.meta.browse,
})
</script>

<template>
  <GenreGrid :key="genreSlug" :genre-slug="genreSlug" />
</template>

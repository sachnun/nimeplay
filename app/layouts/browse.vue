<script setup lang="ts">
const { genres, selectedGenre } = useGenres()
const searchOpen = ref(false)
</script>

<template>
  <div class="px-6 py-8">
    <GenreFilter :genres="genres" :selected-genre="selectedGenre" @search="searchOpen = true" @sign-in="searchOpen = false" />

    <slot />

    <SearchBar :open="searchOpen" @close="searchOpen = false" @open="searchOpen = true" />
  </div>
</template>

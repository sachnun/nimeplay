<script setup lang="ts">
const props = defineProps<{ name: string; slug: string }>()
const { setSelectedGenre } = useGenre()

function selectGenre() {
  setSelectedGenre({ name: props.name, slug: props.slug })
}
</script>

<template>
  <NuxtLink
    to="/"
    class="text-xs px-2 py-0.5 rounded-full bg-white/15 text-zinc-200 hover:bg-white/25 transition-colors"
    @click="selectGenre"
  >
    {{ name }}
  </NuxtLink>
</template>

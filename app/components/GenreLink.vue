<script setup lang="ts">
defineProps<{ name: string; slug: string }>()
</script>

<template>
  <NuxtLink
    :to="`/?genre=${slug}`"
    class="text-xs px-2 py-0.5 rounded-full bg-white/15 text-zinc-200 hover:bg-white/25 transition-colors"
  >
    {{ name }}
  </NuxtLink>
</template>

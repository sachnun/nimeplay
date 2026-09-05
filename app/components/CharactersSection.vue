<script setup lang="ts">
import type { AnimeCharacter } from '~/utils/types'

defineProps<{
  characters?: AnimeCharacter[]
}>()
</script>

<template>
  <section v-if="characters && characters.length > 0">
    <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
      Characters
    </h2>
    <CharacterList :characters="characters" />
  </section>
</template>

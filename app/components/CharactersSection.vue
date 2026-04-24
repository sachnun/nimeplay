<script setup lang="ts">
import type { JikanCharacter } from '~/utils/types'

defineProps<{
  characters?: JikanCharacter[]
  loading: boolean
}>()
</script>

<template>
  <section v-if="loading || (characters && characters.length > 0)">
    <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
      Characters
    </h2>
    <div v-if="loading" class="animate-pulse grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
      <div v-for="i in 6" :key="i" class="flex items-center gap-2.5" :class="i >= 4 ? 'hidden sm:flex' : ''">
        <div class="w-10 h-10 bg-zinc-800 rounded-full flex-shrink-0" />
        <div class="space-y-1 flex-1">
          <div class="h-3 bg-zinc-800 rounded w-2/3" />
          <div class="h-2.5 bg-zinc-800 rounded w-1/2" />
        </div>
      </div>
    </div>
    <CharacterList v-else :characters="characters || []" />
  </section>
</template>

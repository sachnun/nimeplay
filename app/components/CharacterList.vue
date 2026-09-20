<script setup lang="ts">
import type { AnimeCharacter } from '~/utils/types'

const props = defineProps<{ characters?: AnimeCharacter[] }>()

const displayed = computed(() => props.characters ?? [])
</script>

<template>
  <section v-if="characters && characters.length > 0" class="@container">
    <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
      Characters
    </h2>
    <div class="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:gap-x-4 @[420px]:[grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
      <div
        v-for="char in displayed"
        :key="char.name"
        class="flex items-center gap-2 sm:gap-2.5 min-w-0 rounded-lg px-1.5 py-1 -mx-1.5"
      >
        <img
          :src="char.imageUrl"
          :alt="char.name"
          width="40"
          height="40"
          loading="lazy"
          decoding="async"
          class="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover flex-shrink-0"
        >
        <div class="min-w-0">
          <span class="text-xs text-zinc-200 truncate block" :class="char.role === 'Main' ? 'font-bold' : 'font-medium'">{{ char.name }}</span>
          <span v-if="char.voiceActor" class="text-[10px] text-zinc-500 truncate block">CV: {{ char.voiceActor.name }}</span>
          <span v-else class="text-[10px]" :class="char.role === 'Main' ? 'text-white' : 'text-zinc-500'">{{ char.role }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

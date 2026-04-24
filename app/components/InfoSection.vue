<script setup lang="ts">
import type { JikanAnimeData, OtakudesuInfo } from '~/utils/types'

const props = defineProps<{
  otakudesu: OtakudesuInfo
  jikan: JikanAnimeData | null
  loading: boolean
}>()

const items = computed(() => [
  { label: 'Status', value: props.otakudesu.status },
  { label: 'Type', value: props.otakudesu.type },
  { label: 'Episodes', value: props.otakudesu.totalEpisode },
  { label: 'Studio', value: props.otakudesu.studio },
].filter((item) => item.value))
</script>

<template>
  <section>
    <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3 [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">
      Information
    </h2>
    <div v-if="loading" class="animate-pulse flex flex-wrap gap-x-8 gap-y-3">
      <div v-for="i in 5" :key="i" class="space-y-1">
        <div class="h-3 bg-zinc-800 rounded w-12" />
        <div class="h-4 bg-zinc-800 rounded w-16" />
      </div>
    </div>
    <div v-else class="flex flex-wrap gap-x-8 gap-y-3 text-sm">
      <div v-for="item in items" :key="item.label" class="flex justify-between gap-2 sm:block">
        <span class="text-zinc-400 text-xs uppercase tracking-wide [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">{{ item.label }}</span>
        <span class="sm:ml-0 sm:block text-zinc-100 text-sm [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">{{ item.value }}</span>
      </div>
    </div>
  </section>
</template>

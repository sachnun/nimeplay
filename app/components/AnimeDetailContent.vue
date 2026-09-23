<script setup lang="ts">
import type { AnimeDetail } from '~/types'

defineProps<{ anime: AnimeDetail; hideBack?: boolean }>()
</script>

<template>
  <AnimeDetail
    :mal-id="anime.malId"
    :title="anime.title"
    :japanese-title="anime.japanese || undefined"
    :thumbnail="anime.thumbnail"
    :genres="anime.genres"
    :hide-back="hideBack"
    :otakudesu="{
      score: anime.score,
      status: anime.status,
      type: anime.type,
      duration: anime.duration,
      studio: anime.studio,
      source: anime.source,
      releaseDate: anime.releaseDate,
    }"
    :episodes="anime.episodes.map(entry => entry.number)"
    :synopsis="anime.synopsis"
    :characters="anime.characters"
  />
</template>

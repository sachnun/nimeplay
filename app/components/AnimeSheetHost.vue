<script setup lang="ts">
import type { AnimeDetail } from '~/utils/types'

const sheet = useAnimeSheet()
const open = computed(() => sheet.state.value.open)
const anime = ref<AnimeDetail | null>(null)
const sheetRef = ref<{ requestClose: () => void } | null>(null)
let fromPopstate = false

watch(() => sheet.state.value.malId, async (malId) => {
  anime.value = null
  if (!malId) return
  try {
    anime.value = await $fetch<AnimeDetail>(`/api/anime/${malId}`)
  } catch {
    anime.value = null
    sheet.markClosed()
    sheet.dropFakeEntry()
  }
}, { immediate: true })

watch(() => sheet.state.value.closing, (closing) => {
  if (!closing) return
  fromPopstate = true
  sheetRef.value?.requestClose()
})

function onClosed() {
  const goBack = !fromPopstate && sheet.hasFakeEntry()
  sheet.markClosed()
  if (goBack) {
    sheet.dropFakeEntry()
    history.back()
  }
  fromPopstate = false
}
</script>

<template>
  <AnimeDetailSheet v-if="open" ref="sheetRef" :thumbnail="anime?.thumbnail" @close="onClosed">
    <AnimeDetailContent v-if="anime" :anime="anime" hide-back />
    <div v-else class="h-full flex items-center justify-center">
      <span class="w-7 h-7 rounded-full border-2 border-zinc-700 border-t-zinc-300 animate-spin" />
    </div>
  </AnimeDetailSheet>
</template>

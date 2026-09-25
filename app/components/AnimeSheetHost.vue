<script setup lang="ts">
import type { AnimeDetail } from '~/types'

const sheet = useAnimeSheet()
const orpc = useOrpc()
const open = computed(() => sheet.state.value.open)
const anime = ref<AnimeDetail | null>(null)
const sheetRef = ref<{ requestClose: () => void } | null>(null)
let fromPopstate = false

watch(() => sheet.state.value.malId, async (malId) => {
  anime.value = null
  if (!malId) return
  try {
    anime.value = await orpc.anime.detail({ malId })
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
  <AnimeDetailSheet v-if="open" ref="sheetRef" :thumbnail="anime?.thumbnail" :title="anime?.title" @close="onClosed">
    <AnimeDetailContent v-if="anime" :anime="anime" hide-back />
  </AnimeDetailSheet>
</template>

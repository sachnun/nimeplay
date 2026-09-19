<script setup lang="ts">
import type { AnimeDetail } from '~/utils/types'

const sheet = useAnimeSheet()
const open = computed(() => sheet.state.value.open)
const anime = ref<AnimeDetail | null>(null)
const sheetRef = ref<{ requestClose: () => void; getScrollTop: () => number; setScrollTop: (top: number) => void } | null>(null)
let fromPopstate = false
let sheetScrollTop = 0

watch(() => sheet.state.value.malId, async (malId) => {
  sheetScrollTop = 0
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

watch(() => sheet.state.value.suspended, (suspended) => {
  if (suspended) sheetScrollTop = sheetRef.value?.getScrollTop() ?? 0
})

watch(() => sheet.state.value.open, async (open) => {
  if (!open) return
  await nextTick()
  if (sheet.state.value.open && !sheet.state.value.suspended) sheetRef.value?.setScrollTop(sheetScrollTop)
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

<script lang="ts">
  import type { AnimeDetail } from '#lib/shared/types'
  import { getAnimeDetail } from '#lib/remote/detail.remote'
  import { animeSheet, dropFakeEntry, hasFakeEntry, markAnimeSheetClosed } from '#lib/anime-sheet.svelte'
  import AnimeDetailContent from './AnimeDetailContent.svelte'
  import AnimeDetailSheet from './AnimeDetailSheet.svelte'

  let anime = $state<AnimeDetail | null>(null)
  let sheetRef: AnimeDetailSheet | null = $state(null)
  let fromPopstate = false
  let loadedMalId = 0

  $effect(() => {
    const malId = animeSheet.malId
    if (malId === loadedMalId) return
    loadedMalId = malId
    anime = null
    if (!malId) return
    let cancelled = false
    getAnimeDetail({ malId })
      .then(detail => {
        if (!cancelled) anime = detail
      })
      .catch(() => {
        if (cancelled) return
        anime = null
        markAnimeSheetClosed()
        dropFakeEntry()
      })
    return () => {
      cancelled = true
    }
  })

  $effect(() => {
    if (!animeSheet.closing) return
    fromPopstate = true
    sheetRef?.requestClose()
  })

  function onClosed() {
    const goBack = !fromPopstate && hasFakeEntry()
    markAnimeSheetClosed()
    if (goBack) {
      dropFakeEntry()
      history.back()
    }
    fromPopstate = false
  }
</script>

{#if animeSheet.open}
  <AnimeDetailSheet bind:this={sheetRef} thumbnail={anime?.thumbnail} title={anime?.title} onclose={onClosed}>
    {#if anime}
      <AnimeDetailContent {anime} hideBack />
    {/if}
  </AnimeDetailSheet>
{/if}

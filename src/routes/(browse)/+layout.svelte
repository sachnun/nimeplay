<script lang="ts">
  import { ANIME_SHEET_DETAIL_RE, isAnimeSheetDevice } from '#lib/anime-sheet'
  import {
    animeSheet,
    dropFakeEntry,
    markAnimeSheetClosed,
    openAnimeSheet,
  } from '#lib/anime-sheet.svelte'
  import { beforeNavigate } from '$app/navigation'
  let { children } = $props()

  beforeNavigate(navigation => {
    if (animeSheet.open) {
      markAnimeSheetClosed()
      dropFakeEntry()
    }
    const from = navigation.from
    if (!from || !navigation.to) return
    if (!ANIME_SHEET_DETAIL_RE.test(navigation.to.url.pathname)) return
    if (!isAnimeSheetDevice()) return
    const malId = Number(navigation.to.params?.malId)
    openAnimeSheet(malId, from.url.pathname + from.url.search, navigation.to.url.pathname)
    navigation.cancel()
  })
</script>

{@render children()}

<script lang="ts">
  import EpisodePlayer from '#lib/components/EpisodePlayer.svelte'
  import { loadEpisodeInfo } from '#lib/remote/episode.remote'
  import type { PageProps } from './$types'

  let { params }: PageProps = $props()

  const malId = $derived(Number(params.malId) || 0)
  const episodeNumber = $derived(Number(params.episode) || 0)
  const page = $derived(await loadEpisodeInfo({ malId, episodeNumber }))
</script>

<svelte:head>
  <title>{page.episode.title} - Nimeplay</title>
</svelte:head>

<EpisodePlayer
  malId={page.anime.malId}
  episodeNumber={page.episodeNumber}
  episode={page.episode}
  episodes={page.episodes}
  animeTitle={page.anime.title}
  animeThumbnail={page.anime.thumbnail}
/>

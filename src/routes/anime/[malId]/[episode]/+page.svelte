<script lang="ts">
  import EpisodePlayer from '#lib/components/EpisodePlayer.svelte'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()
</script>

<svelte:head>
  <title>{data.episode.title} - Nimeplay</title>
</svelte:head>

<EpisodePlayer
  malId={data.anime.malId}
  episodeNumber={data.episodeNumber}
  episode={data.episode}
  episodes={data.episodes}
  animeTitle={data.anime.title}
  animeThumbnail={data.anime.thumbnail}
/>

<script lang="ts">
  import type { AnimeDetail } from '#lib/shared/types'
  import AnimeDetailView from './AnimeDetail.svelte'

  let { anime, hideBack = false }: { anime: AnimeDetail; hideBack?: boolean } = $props()
</script>

<AnimeDetailView
  malId={anime.malId}
  title={anime.title}
  japaneseTitle={anime.japanese || undefined}
  thumbnail={anime.thumbnail}
  genres={anime.genres}
  {hideBack}
  otakudesu={{
    score: anime.score,
    status: anime.status,
    type: anime.type,
    duration: anime.duration,
    studio: anime.studio,
    releaseDate: anime.releaseDate,
  }}
  episodes={anime.episodes.map(entry => entry.number)}
  synopsis={anime.synopsis}
  characters={anime.characters}
/>

<script lang="ts">
  import GenreGrid from '#lib/components/GenreGrid.svelte'
  import { listGenrePage, listGenres } from '#lib/remote/genre.remote'
  import type { PageProps } from './$types'

  let { params }: PageProps = $props()

  const genreSlug = $derived((params.genreSlug || '').toLowerCase())
  const genreName = $derived((await listGenres()).find(genre => genre.slug === genreSlug)?.name ?? genreSlug)
  const genrePage = $derived(await listGenrePage({ slug: genreSlug, page: 1 }))
</script>

<svelte:head>
  <title>{genreName} - Nimeplay</title>
</svelte:head>

{#key genreSlug}
  <GenreGrid {genreSlug} initialData={genrePage} />
{/key}

<script lang="ts">
  import GenreGrid from '#lib/components/GenreGrid.svelte'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()
</script>

<svelte:head>
  <title>{data.genreName} - Nimeplay</title>
</svelte:head>

{#key data.genreSlug}
  <GenreGrid genreSlug={data.genreSlug} initialData={data.genrePage} />
{/key}

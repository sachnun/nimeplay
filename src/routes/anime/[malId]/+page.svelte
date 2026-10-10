<script lang="ts">
  import AnimeDetailContent from '#lib/components/AnimeDetailContent.svelte'
  import EmptyState from '#lib/components/EmptyState.svelte'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()
</script>

<svelte:head>
  <title>{data.anime ? `${data.anime.title} - Nimeplay` : 'Nimeplay'}</title>
</svelte:head>

{#if data.detailFailed}
  <EmptyState />
{:else if data.anime}
  <div class="grid min-h-dvh">
    <AnimeDetailContent anime={data.anime} />
  </div>
{/if}

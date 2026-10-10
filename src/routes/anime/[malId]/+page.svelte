<script lang="ts">
  import AnimeDetailContent from '#lib/components/AnimeDetailContent.svelte'
  import EmptyState from '#lib/components/EmptyState.svelte'
  import { getAnimeDetail } from '#lib/remote/detail.remote'
  import type { PageProps } from './$types'

  let { params }: PageProps = $props()

  const malId = $derived(Number(params.malId) || 0)
  const detail = $derived(await getAnimeDetail({ malId }))
</script>

<svelte:head>
  <title>{detail ? `${detail.title} - Nimeplay` : 'Nimeplay'}</title>
</svelte:head>

{#if detail}
  <div class="grid min-h-dvh">
    <AnimeDetailContent anime={detail} />
  </div>
{:else}
  <EmptyState />
{/if}

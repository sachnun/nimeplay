<script lang="ts">
  import AnimeGrid from '#lib/components/AnimeGrid.svelte'
  import EmptyState from '#lib/components/EmptyState.svelte'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()
</script>

<svelte:head>
  <title>Nimeplay</title>
</svelte:head>

{#if data.homeFailed}
  <section>
    <EmptyState />
  </section>
{:else}
  <section>
    <AnimeGrid
      pageType="ONGOING"
      initialData={data.home.ongoingData}
      nextPageType="COMPLETED"
      nextInitialData={data.home.completedData}
      nextShowDay={false}
    />
  </section>
{/if}

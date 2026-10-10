<script lang="ts">
  import AnimeGrid from '#lib/components/AnimeGrid.svelte'
  import EmptyState from '#lib/components/EmptyState.svelte'
  import { listAnime } from '#lib/remote/catalog.remote'
  import { isServerError } from '#lib/error'

  const home = await Promise.allSettled([listAnime({ status: 'ONGOING', page: 1 }), listAnime({ status: 'COMPLETED', page: 1 })])

  const empty = { anime: [], totalPages: 1 }
  const ongoing = home[0].status === 'fulfilled' ? home[0].value : empty
  const completed = home[1].status === 'fulfilled' ? home[1].value : empty
  const failed = home.some(result => result.status === 'rejected' && isServerError(result.reason))
</script>

<svelte:head>
  <title>Nimeplay</title>
</svelte:head>

{#if failed}
  <section>
    <EmptyState />
  </section>
{:else}
  <section>
    <AnimeGrid pageType="ONGOING" initialData={ongoing} nextPageType="COMPLETED" nextInitialData={completed} nextShowDay={false} />
  </section>
{/if}

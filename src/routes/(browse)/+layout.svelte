<script lang="ts">
  import { page } from '$app/state'
  import GenreFilter from '#lib/components/GenreFilter.svelte'
  import SearchBar from '#lib/components/SearchBar.svelte'
  import type { LayoutProps } from './$types'

  let { children, data }: LayoutProps = $props()

  let searchOpen = $state(false)

  const genres = $derived(data.genres)
  const selectedGenre = $derived(genres.find(g => g.slug === page.params.genreSlug?.toLowerCase()) ?? null)
</script>

<div class="px-6 pb-8">
  <GenreFilter {genres} {selectedGenre} onsearch={() => (searchOpen = true)} onsignin={() => (searchOpen = false)} />

  {@render children()}

  <SearchBar open={searchOpen} onclose={() => (searchOpen = false)} onopen={() => (searchOpen = true)} />
</div>

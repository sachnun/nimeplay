import type { Genre } from '~/types'

export function useGenres() {
  const nuxtApp = useNuxtApp()
  const route = useRoute()
  const orpc = useOrpc()

  const list = useAsyncData<Genre[]>('genres', () => orpc.catalog.genres(), {
    default: () => [],
  })

  const homeGenres = computed<Genre[]>(() => (nuxtApp.payload.data.home as { genres?: Genre[] } | undefined)?.genres ?? [])
  const genres = computed<Genre[]>(() => list.data.value.length > 0 ? list.data.value : homeGenres.value)

  const genreSlug = computed(() => String(route.params.genreSlug || '').toLowerCase())
  const selectedGenre = computed<Genre | null>(() => genres.value.find((g) => g.slug === genreSlug.value) ?? null)

  return { genres, selectedGenre, ready: list }
}

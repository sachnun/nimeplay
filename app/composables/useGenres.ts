import type { Genre } from '~/types'

interface GenreListResponse {
  data: Genre[]
}

function fetchGenres() {
  return $fetch<GenreListResponse>('/api/v1/genres')
}

export function useGenres() {
  const nuxtApp = useNuxtApp()
  const route = useRoute()

  const list = useAsyncData<GenreListResponse>('genres', fetchGenres, {
    default: () => ({ data: [] }),
  })

  const homeGenres = computed<Genre[]>(() => (nuxtApp.payload.data.home as { genres?: Genre[] } | undefined)?.genres ?? [])
  const genres = computed<Genre[]>(() => list.data.value.data.length > 0 ? list.data.value.data : homeGenres.value)

  const genreSlug = computed(() => String(route.params.genreSlug || '').toLowerCase())
  const selectedGenre = computed<Genre | null>(() => genres.value.find((g) => g.slug === genreSlug.value) ?? null)

  return { genres, selectedGenre, ready: list }
}

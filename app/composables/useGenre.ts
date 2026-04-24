import type { Genre } from '~/utils/types'

export function useGenre() {
  const selectedGenre = useState<Genre | null>('selected-genre', () => null)
  const setSelectedGenre = (genre: Genre | null) => {
    selectedGenre.value = genre
  }
  return { selectedGenre, setSelectedGenre }
}

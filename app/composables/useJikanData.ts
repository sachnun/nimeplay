import { JIKAN_ANIME_QUERY } from '~/graphql/operations'
import type { JikanAnimeData } from '~/utils/types'
import { getMalId, saveMalId } from '~/utils/jikanCache'

export function useJikanData(animeSlug: Ref<string> | string, title: Ref<string> | string, japaneseTitle?: Ref<string | undefined> | string) {
  const data = ref<JikanAnimeData | null>(null)
  const loading = ref(true)

  const slugRef = toRef(animeSlug)
  const titleRef = toRef(title)
  const japaneseRef = japaneseTitle === undefined ? ref<string | undefined>() : toRef(japaneseTitle)

  const load = async () => {
    loading.value = true
    const cachedMalId = getMalId(slugRef.value)
    const result = await graphqlQuery<{ jikanAnime: JikanAnimeData | null }, { title: string; japaneseTitle?: string; cachedMalId?: number }>(
      JIKAN_ANIME_QUERY,
      {
        title: titleRef.value,
        japaneseTitle: japaneseRef.value,
        cachedMalId: cachedMalId ?? undefined,
      },
      'no-cache',
    )
    if (result.jikanAnime) {
      saveMalId(slugRef.value, result.jikanAnime.malId)
      data.value = result.jikanAnime
    }
    loading.value = false
  }

  if (import.meta.client) {
    watch([slugRef, titleRef, japaneseRef], load, { immediate: true })
  }

  return { data, loading }
}

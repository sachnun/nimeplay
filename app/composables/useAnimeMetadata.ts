import { fetchAnimeMetadata } from '~/utils/anilist'
import type { AnimeMetadata } from '~/utils/types'

export function useAnimeMetadata(animeSlug: Ref<string> | string, title: Ref<string> | string, japaneseTitle?: Ref<string | undefined> | string) {
  const data = ref<AnimeMetadata | null>(null)
  const loading = ref(true)

  const slugRef = toRef(animeSlug)
  const titleRef = toRef(title)
  const japaneseRef = japaneseTitle === undefined ? ref<string | undefined>() : toRef(japaneseTitle)

  const load = async () => {
    loading.value = true
    const cached = await getFreshAnimeMetadata(slugRef.value)
    if (cached) {
      data.value = cached
      loading.value = false
      return
    }
    const cachedMalId = await getMalId(slugRef.value)
    const result = await fetchAnimeMetadata(titleRef.value, japaneseRef.value, cachedMalId)
    if (result) {
      if (result.malId) await saveMalId(slugRef.value, result.malId)
      await setAnimeMetadata(slugRef.value, result)
      data.value = result
    }
    loading.value = false
  }

  if (import.meta.client) {
    const { $runIdle } = useNuxtApp()
    watch([slugRef, titleRef, japaneseRef], (_, __, onCleanup) => {
      loading.value = true
      const cancel = $runIdle(() => { void load() }, 1800)
      onCleanup(cancel)
    }, { immediate: true })
  }

  return { data, loading }
}

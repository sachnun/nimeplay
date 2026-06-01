import type { JikanAnimeData } from '~/utils/types'

export function useJikanData(animeSlug: Ref<string> | string, title: Ref<string> | string, japaneseTitle?: Ref<string | undefined> | string) {
  const data = ref<JikanAnimeData | null>(null)
  const loading = ref(true)

  const slugRef = toRef(animeSlug)
  const titleRef = toRef(title)
  const japaneseRef = japaneseTitle === undefined ? ref<string | undefined>() : toRef(japaneseTitle)

  const load = async () => {
    loading.value = true
    const cached = await getFreshJikanData(slugRef.value)
    if (cached) {
      data.value = cached
      loading.value = false
      return
    }
    const cachedMalId = await getMalId(slugRef.value)
    const result = await $fetch<JikanAnimeData | null>('/api/jikan', {
      params: {
        title: titleRef.value,
        japaneseTitle: japaneseRef.value || undefined,
        cachedMalId: cachedMalId ?? undefined,
      },
    })
    if (result) {
      await saveMalId(slugRef.value, result.malId)
      await setJikanData(slugRef.value, result)
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

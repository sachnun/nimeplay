import { fetchAnimeMetadata } from '~/utils/metadata'
import type { AnimeMetadata } from '~/utils/types'

export function useAnimeMetadata(malId: Ref<number> | number, title: Ref<string> | string, japaneseTitle?: Ref<string | undefined> | string) {
  const data = ref<AnimeMetadata | null>(null)
  const loading = ref(true)

  const idRef = toRef(malId)
  const titleRef = toRef(title)
  const japaneseRef = japaneseTitle === undefined ? ref<string | undefined>() : toRef(japaneseTitle)

  const load = async () => {
    if (!idRef.value) return
    loading.value = true
    const result = await fetchAnimeMetadata(idRef.value)
    if (result) data.value = result
    loading.value = false
  }

  if (import.meta.client) {
    const { $runIdle } = useNuxtApp()
    watch([idRef, titleRef, japaneseRef], (_, __, onCleanup) => {
      loading.value = true
      const cancel = $runIdle(() => { void load() }, 1800)
      onCleanup(cancel)
    }, { immediate: true })
  }

  return { data, loading }
}

import type { JikanAnimeData } from '~/utils/types'
import { getMalId, saveMalId } from '~/utils/jikanCache'

export function useJikanData(animeSlug: Ref<string> | string, title: Ref<string> | string, japaneseTitle?: Ref<string | undefined> | string) {
  const trpc = useTrpc()
  const data = ref<JikanAnimeData | null>(null)
  const loading = ref(true)

  const slugRef = toRef(animeSlug)
  const titleRef = toRef(title)
  const japaneseRef = japaneseTitle === undefined ? ref<string | undefined>() : toRef(japaneseTitle)

  const load = async () => {
    loading.value = true
    const cachedMalId = getMalId(slugRef.value)
    const result = await trpc.jikanAnime.query({
      title: titleRef.value,
      japaneseTitle: japaneseRef.value,
      cachedMalId: cachedMalId ?? undefined,
    })
    if (result) {
      saveMalId(slugRef.value, result.malId)
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

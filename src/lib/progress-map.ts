import { SvelteMap } from 'svelte/reactivity'
import { getContinueWatching } from '#lib/storage'

export type { WatchProgress } from '#lib/storage'
export { progressKey } from '#lib/storage'

interface ProgressEntry {
  malId: number
  episodeNumber: number
  currentTime: number
  duration: number
  latestEpisode?: number
}

export const progressMap = new SvelteMap<number, ProgressEntry>()

export async function syncProgressMap(fallback: ProgressEntry[] = []): Promise<void> {
  const all = await getContinueWatching()
  const next = all.length > 0 ? all : fallback
  progressMap.clear()
  for (const item of next) progressMap.set(item.malId, item)
}

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

class ProgressMapStore {
  private items = $state<ProgressEntry[]>([])

  get value(): Map<number, ProgressEntry> {
    const map = new Map<number, ProgressEntry>()
    for (const item of this.items) map.set(item.malId, item)
    return map
  }

  async sync(fallback: ProgressEntry[] = []): Promise<void> {
    const all = await getContinueWatching()
    this.items = all.length > 0 ? all : fallback
  }
}

export const progressMapStore = new ProgressMapStore()


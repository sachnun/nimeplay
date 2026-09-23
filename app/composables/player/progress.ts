import type { ComputedRef, Ref } from 'vue'
import { hasFiniteDuration } from '~/utils/player'

interface EpisodePlayerProgressOptions {
  videoRef: Ref<HTMLVideoElement | null>
  malId: number
  currentEpisodeNum: Ref<number>
  episodes: number[]
  duration: Ref<number>
  progressKey: ComputedRef<string>
}

export function useEpisodePlayerProgress(options: EpisodePlayerProgressOptions) {
  const { videoRef, malId, currentEpisodeNum, episodes, duration, progressKey } = options
  let lastSavedTime = 0

  function latestAvailableEpisode() {
    return episodes.length ? Math.max(...episodes) : undefined
  }

  function currentProgressPayload() {
    const video = videoRef.value
    const fallbackDuration = duration.value || 1
    return {
      currentTime: video ? video.currentTime : fallbackDuration,
      duration: video && hasFiniteDuration(video) ? video.duration : fallbackDuration,
      malId,
      episodeNumber: currentEpisodeNum.value,
      latestEpisode: latestAvailableEpisode(),
    }
  }

  async function doSaveProgress() {
    const video = videoRef.value
    if (!video || !hasFiniteDuration(video)) return
    if (video.currentTime === lastSavedTime) return
    lastSavedTime = video.currentTime
    await saveProgress(progressKey.value, {
      currentTime: video.currentTime,
      duration: video.duration,
      malId,
      episodeNumber: currentEpisodeNum.value,
      latestEpisode: latestAvailableEpisode(),
    })
  }

  async function savedResumeTime() {
    const saved = await getProgress(progressKey.value)
    if (!saved || (await getEpisodeStatus(progressKey.value)) !== 'in_progress') return 0
    return saved.currentTime > 0 ? saved.currentTime : 0
  }

  function resetSave() {
    lastSavedTime = 0
  }

  return { doSaveProgress, savedResumeTime, currentProgressPayload, latestAvailableEpisode, resetSave }
}

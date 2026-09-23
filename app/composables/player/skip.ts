import type { Ref } from 'vue'
import { hasFiniteDuration } from '~/utils/player'
import type { SkipTime } from '~/types'

interface EpisodePlayerSkipOptions {
  malId: number
  currentEpisodeNum: Ref<number>
  autoSkip: Ref<boolean>
  skipTimes: Ref<SkipTime[]>
  videoRef: Ref<HTMLVideoElement | null>
}

export function useEpisodePlayerSkip(options: EpisodePlayerSkipOptions) {
  const { malId, currentEpisodeNum, autoSkip, skipTimes, videoRef } = options
  let fetched = false

  function shouldSkipSegment(skipTime: SkipTime, time: number) {
    return time >= skipTime.interval.startTime && time < skipTime.interval.endTime - 1
  }

  function autoSkipCurrentSegment(video: HTMLVideoElement) {
    if (!autoSkip.value) return
    const current = skipTimes.value.find((skipTime) => shouldSkipSegment(skipTime, video.currentTime))
    if (current) video.currentTime = current.interval.endTime
  }

  function currentVideoDuration() {
    const video = videoRef.value
    return hasFiniteDuration(video) ? video?.duration ?? null : null
  }

  async function fetchSkipTimesIfNeeded() {
    if (fetched) return
    const episodeLength = currentVideoDuration()
    if (episodeLength === null) return
    fetched = true
    const epNum = currentEpisodeNum.value
    if (!epNum) return
    skipTimes.value = await fetchSkipTimes(malId, epNum, episodeLength)
  }

  function resetSkip() {
    fetched = false
    skipTimes.value = []
  }

  return { autoSkipCurrentSegment, fetchSkipTimesIfNeeded, resetSkip }
}

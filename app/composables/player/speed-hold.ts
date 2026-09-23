import type { Ref } from 'vue'

interface EpisodePlayerSpeedHoldOptions {
  videoRef: Ref<HTMLVideoElement | null>
  speedBoost: Ref<boolean>
  showControls: Ref<boolean>
  showEpisodes: Ref<boolean>
  wasLongPress: Ref<boolean>
  clearIdleTimer: () => void
  setHlsMaxBufferLength: (length: number) => void
  clearPendingTap: () => void
}

export function useEpisodePlayerSpeedHold(options: EpisodePlayerSpeedHoldOptions) {
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressActive = false

  function canStart() {
    const video = options.videoRef.value
    return Boolean(video && !video.paused)
  }

  function start() {
    options.clearPendingTap()
    longPressActive = true
    options.wasLongPress.value = true
    const video = options.videoRef.value
    if (!video) return
    options.setHlsMaxBufferLength(120)
    video.playbackRate = 3
    options.showControls.value = false
    options.showEpisodes.value = false
    options.clearIdleTimer()
    options.speedBoost.value = true
  }

  function stop() {
    longPressActive = false
    const video = options.videoRef.value
    if (video) video.playbackRate = 1
    options.setHlsMaxBufferLength(60)
    options.speedBoost.value = false
  }

  function cancelTimer() {
    if (longPressTimer) clearTimeout(longPressTimer)
    longPressTimer = null
  }

  function startTimer() {
    cancelTimer()
    longPressTimer = setTimeout(start, 400)
  }

  function isActive() {
    return longPressActive
  }

  function clear() {
    longPressActive = false
    if (options.speedBoost.value) stop()
    else options.speedBoost.value = false
    options.wasLongPress.value = false
  }

  return { canStart, start, stop, startTimer, cancelTimer, isActive, clear }
}

import type { Ref } from 'vue'

interface EpisodePlayerDragSeekOptions {
  videoRef: Ref<HTMLVideoElement | null>
  currentTime: Ref<number>
  duration: Ref<number>
  isSeeking: Ref<boolean>
  showControls: Ref<boolean>
  clearIdleTimer: () => void
  resetIdle: () => void
  seekTo: (time: number) => void
}

export function useEpisodePlayerDragSeek(options: EpisodePlayerDragSeekOptions) {
  let previewSeekTimer: ReturnType<typeof setTimeout> | null = null

  function cancelPreview() {
    if (previewSeekTimer) clearTimeout(previewSeekTimer)
    previewSeekTimer = null
  }

  function schedulePreview() {
    cancelPreview()
    previewSeekTimer = setTimeout(() => {
      previewSeekTimer = null
      if (!options.isSeeking.value) return
      const video = options.videoRef.value
      if (!video) return
      const target = options.currentTime.value
      if (!Number.isFinite(target)) return
      if (Math.abs(video.currentTime - target) < 0.25) return
      try { video.currentTime = target } catch (error) { console.warn('preview seek failed', error) }
    }, 350)
  }

  function clampSeekTime(time: number) {
    if (!Number.isFinite(time)) return null
    return Math.max(0, Math.min(time, options.duration.value || 0))
  }

  function start() {
    cancelPreview()
    options.isSeeking.value = true
    options.showControls.value = true
    options.clearIdleTimer()
  }

  function preview(time: number) {
    const clamped = clampSeekTime(time)
    if (clamped === null) return
    options.currentTime.value = clamped
    schedulePreview()
  }

  function commit(time: number) {
    cancelPreview()
    const clamped = clampSeekTime(time)
    if (clamped === null) return
    options.seekTo(clamped)
    options.isSeeking.value = false
    options.resetIdle()
  }

  return { start, preview, commit, cancelPreview }
}

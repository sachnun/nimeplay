import type { Ref } from 'vue'

type ScrubPreview = { current: number; delta: number } | null

interface EpisodePlayerDragSeekOptions {
  videoRef: Ref<HTMLVideoElement | null>
  currentTime: Ref<number>
  duration: Ref<number>
  isSeeking: Ref<boolean>
  scrubPreview: Ref<ScrubPreview>
  showControls: Ref<boolean>
  showEpisodes: Ref<boolean>
  clearIdleTimer: () => void
  resetIdle: () => void
  seekTo: (time: number) => void
  isBlocked: () => boolean
  clearPendingTap: () => void
  cancelLongPressTimer: () => void
  resetSeekFeedback: () => void
}

export function useEpisodePlayerDragSeek(options: EpisodePlayerDragSeekOptions) {
  let scrubActive = false
  let scrubStartX = 0
  let scrubStartTime = 0
  let scrubWidth = 1
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
      if (scrubActive && !options.scrubPreview.value) return
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

  function begin(startX: number, width: number) {
    if (scrubActive) return true
    if (options.isBlocked()) return false
    if (options.isSeeking.value) return false
    const dur = options.duration.value || 0
    if (!Number.isFinite(dur) || dur <= 0) return false
    const video = options.videoRef.value
    if (!video) return false
    options.clearPendingTap()
    options.cancelLongPressTimer()
    options.resetSeekFeedback()
    scrubActive = true
    scrubStartX = startX
    scrubWidth = Math.max(1, width)
    const t = video.currentTime
    scrubStartTime = Number.isFinite(t) ? t : options.currentTime.value
    options.isSeeking.value = true
    options.showControls.value = true
    options.showEpisodes.value = false
    options.clearIdleTimer()
    options.scrubPreview.value = { current: scrubStartTime, delta: 0 }
    cancelPreview()
    return true
  }

  function update(x: number) {
    if (!scrubActive) return
    const dur = options.duration.value || 0
    const delta = ((x - scrubStartX) / scrubWidth) * dur
    const target = clampSeekTime(scrubStartTime + delta)
    if (target === null) return
    options.currentTime.value = target
    options.scrubPreview.value = { current: target, delta: target - scrubStartTime }
    schedulePreview()
  }

  function end(commit: boolean) {
    if (!scrubActive) return false
    cancelPreview()
    scrubActive = false
    const preview = options.scrubPreview.value
    options.scrubPreview.value = null
    if (commit && preview) {
      options.seekTo(preview.current)
    } else {
      const video = options.videoRef.value
      if (video) options.currentTime.value = video.currentTime
    }
    options.isSeeking.value = false
    options.resetIdle()
    return true
  }

  function start() {
    cancelPreview()
    if (scrubActive) {
      scrubActive = false
      options.scrubPreview.value = null
    }
    options.clearPendingTap()
    options.cancelLongPressTimer()
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

  function clear() {
    cancelPreview()
    scrubActive = false
    options.scrubPreview.value = null
  }

  return { isActive: () => scrubActive, begin, update, end, start, preview, commit, clear, cancelPreview }
}

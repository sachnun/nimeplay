import type { Ref } from 'vue'

type TapZone = 'left' | 'center' | 'right'
type SeekIndicator = { side: 'left' | 'right'; seconds: number } | null
type ScrubPreview = { current: number; delta: number } | null

interface EpisodePlayerTapOptions {
  showControls: Ref<boolean>
  controlsVisible: Ref<boolean>
  seekIndicator: Ref<SeekIndicator>
  seekIndicatorKey: Ref<number>
  scrubPreview: Ref<ScrubPreview>
  toggleControlsVisibility: () => void
  togglePlay: () => void
  toggleFullscreen: () => void | Promise<void>
  seekRelative: (delta: number) => void
  cancelPreviewSeek: () => void
}

export function useEpisodePlayerTap(options: EpisodePlayerTapOptions) {
  const lastTap = { left: 0, center: 0, right: 0 }
  let pendingSingleTap: ReturnType<typeof setTimeout> | null = null
  let pendingWasVisible: boolean | null = null
  let seekIndicatorTimer: ReturnType<typeof setTimeout> | null = null
  let seekAccumulator = 0

  function clearPendingTap() {
    if (pendingSingleTap) clearTimeout(pendingSingleTap)
    pendingSingleTap = null
    pendingWasVisible = null
  }

  function resetFeedback() {
    if (seekIndicatorTimer) clearTimeout(seekIndicatorTimer)
    seekIndicatorTimer = null
    seekAccumulator = 0
    options.seekIndicator.value = null
  }

  function showSeekFeedback(side: 'left' | 'right', seconds: number) {
    if (seekIndicatorTimer) clearTimeout(seekIndicatorTimer)
    seekAccumulator += seconds
    options.scrubPreview.value = null
    options.seekIndicator.value = { side, seconds: seekAccumulator }
    options.seekIndicatorKey.value++
    seekIndicatorTimer = setTimeout(() => {
      options.seekIndicator.value = null
      seekAccumulator = 0
    }, 800)
  }

  function handleSeekTap(side: 'left' | 'right', isDoubleTap: boolean) {
    if (!isDoubleTap) return scheduleSingleToggle()
    clearPendingTap()
    options.cancelPreviewSeek()
    const delta = side === 'left' ? -10 : 10
    options.seekRelative(delta)
    showSeekFeedback(side, Math.abs(delta))
  }

  function scheduleSingleToggle() {
    clearPendingTap()
    pendingWasVisible = options.showControls.value
    pendingSingleTap = setTimeout(() => {
      const wasVisible = pendingWasVisible
      pendingSingleTap = null
      pendingWasVisible = null
      if (wasVisible !== null && options.showControls.value !== wasVisible) return
      options.toggleControlsVisibility()
    }, 300)
  }

  function schedulePlayPause() {
    clearPendingTap()
    pendingSingleTap = setTimeout(() => {
      pendingSingleTap = null
      pendingWasVisible = null
      if (!options.controlsVisible.value) return
      options.togglePlay()
    }, 300)
  }

  function handleZoneTap(zone: TapZone) {
    const now = Date.now()
    const isDoubleTap = now - lastTap[zone] < 300
    lastTap[zone] = now
    if (zone === 'center') {
      if (isDoubleTap) {
        clearPendingTap()
        void options.toggleFullscreen()
        return
      }
      if (options.controlsVisible.value) schedulePlayPause()
      else scheduleSingleToggle()
      return
    }
    handleSeekTap(zone, isDoubleTap)
  }

  function getZone(clientX: number, el: HTMLElement): TapZone {
    const rect = el.getBoundingClientRect()
    if (!rect || rect.width <= 0) return 'center'
    const ratio = (clientX - rect.left) / rect.width
    if (ratio < 0.3) return 'left'
    if (ratio < 0.7) return 'center'
    return 'right'
  }

  return { handleZoneTap, getZone, clearPendingTap, resetFeedback }
}

import type { Ref } from 'vue'

type TapZone = 'left' | 'center' | 'right'
type SeekIndicator = { side: 'left' | 'right'; seconds: number } | null

interface EpisodePlayerGestureOptions {
  videoRef: Ref<HTMLVideoElement | null>
  currentTime: Ref<number>
  duration: Ref<number>
  isSeeking: Ref<boolean>
  showControls: Ref<boolean>
  showEpisodes: Ref<boolean>
  speedBoost: Ref<boolean>
  wasLongPress: Ref<boolean>
  seekIndicator: Ref<SeekIndicator>
  seekIndicatorKey: Ref<number>
  clearIdleTimer: () => void
  resetIdle: () => void
  seekRelative: (delta: number) => void
  seekTo: (time: number) => void
  setHlsMaxBufferLength: (length: number) => void
  toggleControlsVisibility: () => void
  toggleFullscreen: () => void | Promise<void>
}

function clearTimer(timer: ReturnType<typeof setTimeout> | null) {
  if (timer) clearTimeout(timer)
}

export function useEpisodePlayerGestures(options: EpisodePlayerGestureOptions) {
  let seekIndicatorTimer: ReturnType<typeof setTimeout> | null = null
  let seekAccumulator = 0
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressActive = false
  let cleanupSpeedHold: (() => void) | null = null
  const lastTap = { left: 0, center: 0, right: 0 }
  let pendingSingleTap: ReturnType<typeof setTimeout> | null = null
  let pendingWasVisible: boolean | null = null

  function clearPendingSingleTap() {
    clearTimer(pendingSingleTap)
    pendingSingleTap = null
    pendingWasVisible = null
  }

  function showSeekFeedback(side: 'left' | 'right', seconds: number) {
    clearTimer(seekIndicatorTimer)
    seekAccumulator += seconds
    options.seekIndicator.value = { side, seconds: seekAccumulator }
    options.seekIndicatorKey.value++
    seekIndicatorTimer = setTimeout(() => {
      options.seekIndicator.value = null
      seekAccumulator = 0
    }, 600)
  }

  function scheduleSingleToggle() {
    clearPendingSingleTap()
    pendingWasVisible = options.showControls.value
    pendingSingleTap = setTimeout(() => {
      const wasVisible = pendingWasVisible
      pendingSingleTap = null
      pendingWasVisible = null
      if (wasVisible !== null && options.showControls.value !== wasVisible) return
      options.toggleControlsVisibility()
    }, 300)
  }

  function handleCenterTap(isDoubleTap: boolean) {
    if (isDoubleTap) {
      clearPendingSingleTap()
      void options.toggleFullscreen()
      return
    }
    scheduleSingleToggle()
  }

  function handleSeekTap(side: 'left' | 'right', isDoubleTap: boolean) {
    if (!isDoubleTap) return scheduleSingleToggle()
    clearPendingSingleTap()
    const delta = side === 'left' ? -10 : 10
    options.seekRelative(delta)
    showSeekFeedback(side, Math.abs(delta))
  }

  function handleZoneTap(zone: TapZone) {
    const now = Date.now()
    const isDoubleTap = now - lastTap[zone] < 300
    lastTap[zone] = now

    if (zone === 'center') handleCenterTap(isDoubleTap)
    else handleSeekTap(zone, isDoubleTap)
  }

  function handleZonePointerUp(zone: TapZone, event: PointerEvent) {
    if (!shouldHandleZonePointerUp(zone, event)) return
    event.preventDefault()
    handleZoneTap(zone)
  }

  function shouldHandleZonePointerUp(zone: TapZone, event: PointerEvent) {
    if (event.pointerType === 'touch' || event.button !== 0) return false
    return !(zone === 'right' && options.wasLongPress.value)
  }

  function handleZoneTouchEnd(zone: TapZone, event: TouchEvent) {
    event.preventDefault()
    if (zone === 'right' && options.wasLongPress.value) return
    handleZoneTap(zone)
  }

  function startSpeedBoost() {
    clearPendingSingleTap()
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

  function stopSpeedBoost() {
    longPressActive = false
    const video = options.videoRef.value
    if (video) video.playbackRate = 1
    options.setHlsMaxBufferLength(60)
    options.speedBoost.value = false
  }

  function shouldIgnoreSpeedHold(event?: PointerEvent) {
    return Boolean(event && event.pointerType === 'mouse' && event.button !== 0)
  }

  function capturePointer(event?: PointerEvent) {
    if (!(event?.currentTarget instanceof HTMLElement)) return
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch (error) { console.warn('setPointerCapture failed', error) }
  }

  function canStartSpeedHold() {
    const video = options.videoRef.value
    return Boolean(video && !video.paused)
  }

  function handleSpeedHoldStart(event?: PointerEvent) {
    if (shouldIgnoreSpeedHold(event)) return
    event?.preventDefault()
    capturePointer(event)
    if (!canStartSpeedHold()) return
    clearTimer(longPressTimer)
    cleanupSpeedHold?.()
    longPressActive = false
    longPressTimer = setTimeout(startSpeedBoost, 400)
    let ended = false
    const cleanup = () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('mouseup', end)
      window.removeEventListener('touchend', end)
      window.removeEventListener('pointercancel', cancelPending)
      window.removeEventListener('touchcancel', cancelPending)
      if (cleanupSpeedHold === cleanup) cleanupSpeedHold = null
    }
    const end = () => {
      if (ended) return
      ended = true
      clearTimer(longPressTimer)
      longPressTimer = null
      if (longPressActive) stopSpeedBoost()
      setTimeout(() => { options.wasLongPress.value = false }, 50)
      cleanup()
    }
    const cancelPending = () => {
      if (longPressActive) return
      end()
    }
    cleanupSpeedHold = cleanup
    window.addEventListener('pointerup', end)
    window.addEventListener('mouseup', end)
    window.addEventListener('touchend', end, { passive: true })
    window.addEventListener('pointercancel', cancelPending)
    window.addEventListener('touchcancel', cancelPending, { passive: true })
  }

  function clampSeekTime(time: number) {
    if (!Number.isFinite(time)) return null
    return Math.max(0, Math.min(time, options.duration.value || 0))
  }

  function onSeekStart() {
    clearPendingSingleTap()
    options.isSeeking.value = true
    options.clearIdleTimer()
  }

  function onSeekPreview(time: number) {
    const clamped = clampSeekTime(time)
    if (clamped === null) return
    options.currentTime.value = clamped
  }

  function onSeekCommit(time: number) {
    const clamped = clampSeekTime(time)
    if (clamped === null) return
    options.seekTo(clamped)
    options.isSeeking.value = false
    options.resetIdle()
  }

  function clearGestureState() {
    clearTimer(longPressTimer)
    clearTimer(seekIndicatorTimer)
    cleanupSpeedHold?.()
    longPressTimer = null
    seekIndicatorTimer = null
    cleanupSpeedHold = null
    longPressActive = false
    seekAccumulator = 0
    clearPendingSingleTap()
    if (options.speedBoost.value) stopSpeedBoost()
    else options.speedBoost.value = false
    options.isSeeking.value = false
    options.seekIndicator.value = null
    options.wasLongPress.value = false
  }

  return {
    clearGestureState,
    handleSpeedHoldStart,
    handleZonePointerUp,
    handleZoneTouchEnd,
    handleZoneTap,
    onSeekCommit,
    onSeekPreview,
    onSeekStart,
  }
}

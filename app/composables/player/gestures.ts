import type { Ref } from 'vue'

type TapZone = 'left' | 'center' | 'right'
type SeekIndicator = { side: 'left' | 'right'; seconds: number } | null
type ScrubPreview = { current: number; delta: number } | null

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
  scrubPreview: Ref<ScrubPreview>
  clearIdleTimer: () => void
  resetIdle: () => void
  seekTo: (time: number) => void
  setHlsMaxBufferLength: (length: number) => void
  toggleControlsVisibility: () => void
  toggleFullscreen: () => void | Promise<void>
}

function clearTimer(timer: ReturnType<typeof setTimeout> | null) {
  if (timer) clearTimeout(timer)
}

export function useEpisodePlayerGestures(options: EpisodePlayerGestureOptions) {
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressActive = false
  const lastTap = { left: 0, center: 0, right: 0 }
  let pendingSingleTap: ReturnType<typeof setTimeout> | null = null
  let pendingWasVisible: boolean | null = null
  let touchTracking = false
  let touchDownZone: TapZone = 'center'
  let touchStartX = 0
  let touchStartY = 0
  let touchWidth = 1
  let touchMoved = false
  let mouseDown = false
  let mouseDownZone: TapZone = 'center'
  let mouseDownX = 0
  let mouseDownY = 0
  let mouseWidth = 1
  let mousePointerId: number | null = null
  let scrubActive = false
  let scrubStartX = 0
  let scrubStartTime = 0
  let scrubWidth = 1
  let previewSeekTimer: ReturnType<typeof setTimeout> | null = null

  function clearPendingSingleTap() {
    clearTimer(pendingSingleTap)
    pendingSingleTap = null
    pendingWasVisible = null
  }

  function cancelLongPressTimer() {
    clearTimer(longPressTimer)
    longPressTimer = null
  }

  function cancelPreviewSeek() {
    clearTimer(previewSeekTimer)
    previewSeekTimer = null
  }

  function schedulePreviewSeek() {
    cancelPreviewSeek()
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

  function handleZoneTap(zone: TapZone) {
    const now = Date.now()
    const isDoubleTap = now - lastTap[zone] < 300
    lastTap[zone] = now
    if (zone === 'center') {
      if (isDoubleTap) {
        clearPendingSingleTap()
        void options.toggleFullscreen()
        return
      }
      scheduleSingleToggle()
      return
    }
    if (isDoubleTap) return
    scheduleSingleToggle()
  }

  function getZone(clientX: number, el: HTMLElement): TapZone {
    const rect = el.getBoundingClientRect()
    if (!rect || rect.width <= 0) return 'center'
    const ratio = (clientX - rect.left) / rect.width
    if (ratio < 0.3) return 'left'
    if (ratio < 0.7) return 'center'
    return 'right'
  }

  function canStartSpeedHold() {
    const video = options.videoRef.value
    return Boolean(video && !video.paused)
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

  function startLongPressTimer() {
    cancelLongPressTimer()
    longPressTimer = setTimeout(startSpeedBoost, 400)
  }

  function clampSeekTime(time: number) {
    if (!Number.isFinite(time)) return null
    return Math.max(0, Math.min(time, options.duration.value || 0))
  }

  function beginScrub(startX: number, width: number) {
    if (scrubActive) return true
    if (longPressActive || options.speedBoost.value) return false
    if (options.isSeeking.value) return false
    const dur = options.duration.value || 0
    if (!Number.isFinite(dur) || dur <= 0) return false
    const video = options.videoRef.value
    if (!video) return false
    clearPendingSingleTap()
    cancelLongPressTimer()
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
    cancelPreviewSeek()
    return true
  }

  function updateScrub(x: number) {
    if (!scrubActive) return
    const dur = options.duration.value || 0
    const delta = ((x - scrubStartX) / scrubWidth) * dur
    const target = clampSeekTime(scrubStartTime + delta)
    if (target === null) return
    options.currentTime.value = target
    options.scrubPreview.value = { current: target, delta: target - scrubStartTime }
    schedulePreviewSeek()
  }

  function endScrub(commit: boolean) {
    if (!scrubActive) return false
    cancelPreviewSeek()
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

  function handleVideoTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1) {
      touchTracking = false
      cancelLongPressTimer()
      return
    }
    const touch = event.touches[0]
    if (!touch) return
    const el = event.currentTarget as HTMLElement | null
    touchDownZone = el ? getZone(touch.clientX, el) : 'center'
    touchStartX = touch.clientX
    touchStartY = touch.clientY
    touchWidth = el ? Math.max(1, el.getBoundingClientRect().width) : (window.innerWidth || 1)
    touchMoved = false
    touchTracking = true
    if (touchDownZone === 'right' && canStartSpeedHold()) startLongPressTimer()
  }

  function handleVideoTouchMove(event: TouchEvent) {
    if (!touchTracking) return
    if (event.touches.length !== 1) return
    const touch = event.touches[0]
    if (!touch) return
    const dx = touch.clientX - touchStartX
    const dy = touch.clientY - touchStartY
    if (!scrubActive) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        if (beginScrub(touchStartX, touchWidth)) {
          cancelLongPressTimer()
          touchMoved = true
        }
      } else if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        cancelLongPressTimer()
        touchMoved = true
      }
    } else {
      updateScrub(touch.clientX)
    }
  }

  function handleVideoTouchEnd(event: TouchEvent) {
    if (!touchTracking && !scrubActive) return
    touchTracking = false
    if (scrubActive) {
      if (event.cancelable) event.preventDefault()
      cancelLongPressTimer()
      endScrub(true)
      return
    }
    if (longPressActive) {
      if (event.cancelable) event.preventDefault()
      cancelLongPressTimer()
      stopSpeedBoost()
      setTimeout(() => { options.wasLongPress.value = false }, 50)
      return
    }
    cancelLongPressTimer()
    if (touchMoved) return
    if (event.cancelable) event.preventDefault()
    handleZoneTap(touchDownZone)
  }

  function handleVideoTouchCancel() {
    touchTracking = false
    cancelLongPressTimer()
    if (scrubActive) endScrub(true)
    if (longPressActive) stopSpeedBoost()
  }

  function handleVideoPointerDown(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    if (event.button !== 0) return
    const el = event.currentTarget as HTMLElement | null
    mouseDownZone = el ? getZone(event.clientX, el) : 'center'
    mouseDownX = event.clientX
    mouseDownY = event.clientY
    mouseWidth = el ? Math.max(1, el.getBoundingClientRect().width) : (window.innerWidth || 1)
    mouseDown = true
    mousePointerId = event.pointerId
    if (el) {
      try { el.setPointerCapture(event.pointerId) } catch (error) { console.warn('setPointerCapture failed', error) }
    }
    if (mouseDownZone === 'right' && canStartSpeedHold()) startLongPressTimer()
  }

  function handleVideoPointerMove(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    if (!mouseDown) return
    if (mousePointerId !== null && event.pointerId !== mousePointerId) return
    const dx = event.clientX - mouseDownX
    const dy = event.clientY - mouseDownY
    if (!scrubActive) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        if (beginScrub(mouseDownX, mouseWidth)) cancelLongPressTimer()
      }
    } else {
      updateScrub(event.clientX)
    }
  }

  function handleVideoPointerUp(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    if (!mouseDown && !scrubActive) return
    if (mousePointerId !== null && event.pointerId !== mousePointerId) return
    mouseDown = false
    mousePointerId = null
    if (scrubActive) {
      event.preventDefault()
      cancelLongPressTimer()
      endScrub(true)
      return
    }
    if (longPressActive) {
      cancelLongPressTimer()
      stopSpeedBoost()
      setTimeout(() => { options.wasLongPress.value = false }, 50)
      return
    }
    cancelLongPressTimer()
    const dx = event.clientX - mouseDownX
    const dy = event.clientY - mouseDownY
    if (Math.hypot(dx, dy) > 10) return
    event.preventDefault()
    handleZoneTap(mouseDownZone)
  }

  function handleVideoPointerCancel(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    mouseDown = false
    mousePointerId = null
    cancelLongPressTimer()
    if (scrubActive) endScrub(true)
    if (longPressActive) stopSpeedBoost()
  }

  function onSeekStart() {
    cancelPreviewSeek()
    if (scrubActive) {
      scrubActive = false
      options.scrubPreview.value = null
    }
    clearPendingSingleTap()
    cancelLongPressTimer()
    options.isSeeking.value = true
    options.showControls.value = true
    options.clearIdleTimer()
  }

  function onSeekPreview(time: number) {
    const clamped = clampSeekTime(time)
    if (clamped === null) return
    options.currentTime.value = clamped
    schedulePreviewSeek()
  }

  function onSeekCommit(time: number) {
    cancelPreviewSeek()
    const clamped = clampSeekTime(time)
    if (clamped === null) return
    options.seekTo(clamped)
    options.isSeeking.value = false
    options.resetIdle()
  }

  function clearGestureState() {
    cancelLongPressTimer()
    cancelPreviewSeek()
    clearPendingSingleTap()
    touchTracking = false
    touchMoved = false
    mouseDown = false
    mousePointerId = null
    scrubActive = false
    longPressActive = false
    options.scrubPreview.value = null
    if (options.speedBoost.value) stopSpeedBoost()
    else options.speedBoost.value = false
    options.isSeeking.value = false
    options.seekIndicator.value = null
    options.wasLongPress.value = false
  }

  return {
    clearGestureState,
    handleVideoPointerCancel,
    handleVideoPointerDown,
    handleVideoPointerMove,
    handleVideoPointerUp,
    handleVideoTouchCancel,
    handleVideoTouchEnd,
    handleVideoTouchMove,
    handleVideoTouchStart,
    onSeekCommit,
    onSeekPreview,
    onSeekStart,
  }
}

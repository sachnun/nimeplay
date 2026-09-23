import type { Ref } from 'vue'
import { useEpisodePlayerDragSeek } from './drag-seek'
import { useEpisodePlayerSpeedHold } from './speed-hold'
import { useEpisodePlayerTap } from './tap'

type TapZone = 'left' | 'center' | 'right'
type SeekIndicator = { side: 'left' | 'right'; seconds: number } | null
type ScrubPreview = { current: number; delta: number } | null

interface EpisodePlayerGestureOptions {
  videoRef: Ref<HTMLVideoElement | null>
  currentTime: Ref<number>
  duration: Ref<number>
  isSeeking: Ref<boolean>
  showControls: Ref<boolean>
  controlsVisible: Ref<boolean>
  showEpisodes: Ref<boolean>
  speedBoost: Ref<boolean>
  wasLongPress: Ref<boolean>
  seekIndicator: Ref<SeekIndicator>
  seekIndicatorKey: Ref<number>
  scrubPreview: Ref<ScrubPreview>
  clearIdleTimer: () => void
  resetIdle: () => void
  seekRelative: (delta: number) => void
  seekTo: (time: number) => void
  setHlsMaxBufferLength: (length: number) => void
  toggleControlsVisibility: () => void
  togglePlay: () => void
  toggleFullscreen: () => void | Promise<void>
}

export function useEpisodePlayerGestures(options: EpisodePlayerGestureOptions) {
  const tap = useEpisodePlayerTap({
    showControls: options.showControls,
    controlsVisible: options.controlsVisible,
    seekIndicator: options.seekIndicator,
    seekIndicatorKey: options.seekIndicatorKey,
    scrubPreview: options.scrubPreview,
    toggleControlsVisibility: options.toggleControlsVisibility,
    togglePlay: options.togglePlay,
    toggleFullscreen: options.toggleFullscreen,
    seekRelative: options.seekRelative,
    cancelPreviewSeek: () => drag.cancelPreview(),
  })

  const speed = useEpisodePlayerSpeedHold({
    videoRef: options.videoRef,
    speedBoost: options.speedBoost,
    showControls: options.showControls,
    showEpisodes: options.showEpisodes,
    wasLongPress: options.wasLongPress,
    clearIdleTimer: options.clearIdleTimer,
    setHlsMaxBufferLength: options.setHlsMaxBufferLength,
    clearPendingTap: tap.clearPendingTap,
  })

  const drag = useEpisodePlayerDragSeek({
    videoRef: options.videoRef,
    currentTime: options.currentTime,
    duration: options.duration,
    isSeeking: options.isSeeking,
    scrubPreview: options.scrubPreview,
    showControls: options.showControls,
    showEpisodes: options.showEpisodes,
    clearIdleTimer: options.clearIdleTimer,
    resetIdle: options.resetIdle,
    seekTo: options.seekTo,
    isBlocked: () => speed.isActive() || options.speedBoost.value,
    clearPendingTap: tap.clearPendingTap,
    cancelLongPressTimer: speed.cancelTimer,
    resetSeekFeedback: tap.resetFeedback,
  })

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

  function handleVideoTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1) {
      touchTracking = false
      speed.cancelTimer()
      return
    }
    const touch = event.touches[0]
    if (!touch) return
    const el = event.currentTarget as HTMLElement | null
    touchDownZone = el ? tap.getZone(touch.clientX, el) : 'center'
    touchStartX = touch.clientX
    touchStartY = touch.clientY
    touchWidth = el ? Math.max(1, el.getBoundingClientRect().width) : (window.innerWidth || 1)
    touchMoved = false
    touchTracking = true
    if (touchDownZone === 'right' && speed.canStart()) speed.startTimer()
  }

  function handleVideoTouchMove(event: TouchEvent) {
    if (!touchTracking) return
    if (event.touches.length !== 1) return
    const touch = event.touches[0]
    if (!touch) return
    const dx = touch.clientX - touchStartX
    const dy = touch.clientY - touchStartY
    if (!drag.isActive()) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        if (drag.begin(touchStartX, touchWidth)) {
          speed.cancelTimer()
          touchMoved = true
        }
      } else if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        speed.cancelTimer()
        touchMoved = true
      }
    } else {
      drag.update(touch.clientX)
    }
  }

  function handleVideoTouchEnd(event: TouchEvent) {
    if (!touchTracking && !drag.isActive()) return
    touchTracking = false
    if (drag.isActive()) {
      if (event.cancelable) event.preventDefault()
      speed.cancelTimer()
      drag.end(true)
      return
    }
    if (speed.isActive()) {
      if (event.cancelable) event.preventDefault()
      speed.cancelTimer()
      speed.stop()
      setTimeout(() => { options.wasLongPress.value = false }, 50)
      return
    }
    speed.cancelTimer()
    if (touchMoved) return
    if (event.cancelable) event.preventDefault()
    tap.handleZoneTap(touchDownZone)
  }

  function handleVideoTouchCancel() {
    touchTracking = false
    speed.cancelTimer()
    if (drag.isActive()) drag.end(true)
    if (speed.isActive()) speed.stop()
  }

  function handleVideoPointerDown(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    if (event.button !== 0) return
    const el = event.currentTarget as HTMLElement | null
    mouseDownZone = el ? tap.getZone(event.clientX, el) : 'center'
    mouseDownX = event.clientX
    mouseDownY = event.clientY
    mouseWidth = el ? Math.max(1, el.getBoundingClientRect().width) : (window.innerWidth || 1)
    mouseDown = true
    mousePointerId = event.pointerId
    if (el) {
      try { el.setPointerCapture(event.pointerId) } catch (error) { console.warn('setPointerCapture failed', error) }
    }
    if (mouseDownZone === 'right' && speed.canStart()) speed.startTimer()
  }

  function handleVideoPointerMove(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    if (!mouseDown) return
    if (mousePointerId !== null && event.pointerId !== mousePointerId) return
    const dx = event.clientX - mouseDownX
    const dy = event.clientY - mouseDownY
    if (!drag.isActive()) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        if (drag.begin(mouseDownX, mouseWidth)) speed.cancelTimer()
      }
    } else {
      drag.update(event.clientX)
    }
  }

  function handleVideoPointerUp(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    if (!mouseDown && !drag.isActive()) return
    if (mousePointerId !== null && event.pointerId !== mousePointerId) return
    mouseDown = false
    mousePointerId = null
    if (drag.isActive()) {
      event.preventDefault()
      speed.cancelTimer()
      drag.end(true)
      return
    }
    if (speed.isActive()) {
      speed.cancelTimer()
      speed.stop()
      setTimeout(() => { options.wasLongPress.value = false }, 50)
      return
    }
    speed.cancelTimer()
    const dx = event.clientX - mouseDownX
    const dy = event.clientY - mouseDownY
    if (Math.hypot(dx, dy) > 10) return
    event.preventDefault()
    tap.handleZoneTap(mouseDownZone)
  }

  function handleVideoPointerCancel(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    mouseDown = false
    mousePointerId = null
    speed.cancelTimer()
    if (drag.isActive()) drag.end(true)
    if (speed.isActive()) speed.stop()
  }

  function clearGestureState() {
    speed.cancelTimer()
    drag.cancelPreview()
    tap.resetFeedback()
    tap.clearPendingTap()
    touchTracking = false
    touchMoved = false
    mouseDown = false
    mousePointerId = null
    drag.clear()
    speed.clear()
    options.isSeeking.value = false
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
    onSeekCommit: drag.commit,
    onSeekPreview: drag.preview,
    onSeekStart: drag.start,
  }
}

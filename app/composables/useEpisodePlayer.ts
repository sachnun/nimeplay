import { preloadHls } from '~/utils/hls'
import { bufferedEndAt, listQualityLevels, type MirrorCandidate } from '~/utils/player'
import { useEpisodePlayerGestures } from './player/gestures'
import { useEpisodePlayerKeyboard } from './player/keyboard'
import { useEpisodePlayerMediaEvents } from './player/media-events'
import { useEpisodePlayerMediaSession } from './player/media-session'
import { useEpisodePlayerProgress } from './player/progress'
import { useEpisodePlayerQuality, pickInitialQuality } from './player/quality'
import { useEpisodePlayerResolution } from './player/resolution'
import { useEpisodePlayerSource } from './player/source'
import { useEpisodePlayerSkip } from './player/skip'
import { useEpisodePlayerVolume } from './player/volume'
import { useEpisodePlayerFullscreen } from './player/fullscreen'
import type { EpisodeData, EpisodePageData, SkipTime } from '~/types'

interface EpisodePlayerProps {
  malId: number
  episodeNumber: number
  episode: EpisodeData
  episodes: number[]
  animeTitle: string
  animeThumbnail: string
}

function clearAnyTimer(timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null) {
  if (timer) clearTimeout(timer)
}

const CONTROLS_IDLE_MS = 3000
const MOBILE_CONTROLS_IDLE_MS = 5000
const START_CONTROLS_IDLE_MS = 1200

export function useEpisodePlayer(props: EpisodePlayerProps) {
  const router = useRouter()

  const episode = ref(props.episode)
  const currentEpisodeNum = ref(props.episodeNumber)
  const directUrl = ref<string | null>(null)
  const directKind = ref<'hls' | 'file' | null>(null)
  const activeQuality = ref('720p')
  const resolving = ref(true)
  const videoLoading = ref(true)
  const loadingMessage = ref('Menyiapkan player...')
  const skipTimes = ref<SkipTime[]>([])
  const autoSkip = ref(false)
  const isPlaying = ref(false)
  const autoNextCountdown = ref<number | null>(null)
  const showControls = ref(true)
  const isTouchDevice = ref(false)
  const showEpisodes = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const buffered = ref(0)
  const volume = ref(1)
  const isMuted = ref(false)
  const isFullscreen = ref(false)
  const isSeeking = ref(false)
  const showVolume = ref(false)
  const seekIndicator = ref<{ side: 'left' | 'right'; seconds: number } | null>(null)
  const seekIndicatorKey = ref(0)
  const scrubPreview = ref<{ current: number; delta: number } | null>(null)
  const volumeIndicator = ref<{ volume: number; isMuted: boolean } | null>(null)
  const speedBoost = ref(false)
  const wasLongPress = ref(false)

  const containerRef = shallowRef<HTMLDivElement | null>(null)
  const videoRef = shallowRef<HTMLVideoElement | null>(null)

  let watchedMarked = false
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let pendingStartHide = false
  let countdownTimer: ReturnType<typeof setInterval> | null = null
  let seekIndicatorTimer: ReturnType<typeof setTimeout> | null = null
  let resetEpoch = 0
  let resetSettled: Promise<void> | null = null

  const progressKey = computed(() => `${props.malId}:${currentEpisodeNum.value}`)

  function episodeAtOffset(offset: number) {
    const idx = props.episodes.indexOf(currentEpisodeNum.value)
    const target = idx === -1 ? null : props.episodes[idx + offset]
    return target ? { num: target } : null
  }

  const nextEpisode = computed(() => {
    return episodeAtOffset(1)
  })

  const prevEpisode = computed(() => {
    return episodeAtOffset(-1)
  })

  const qualityLevels = computed(() => listQualityLevels(episode.value.mirrors))

  function bufferAhead() {
    const video = videoRef.value
    if (!video || video.buffered.length === 0) return 0
    return Math.max(0, bufferedEndAt(video) - video.currentTime)
  }

  const showNative = computed(() => !!directUrl.value)
  const showEmpty = computed(() => !showNative.value && !resolving.value)
  const showLoading = computed(() => resolving.value || (showNative.value && videoLoading.value))
  const controlsVisible = computed(() => !speedBoost.value && (showControls.value || !isPlaying.value))
  const progress = computed(() => duration.value > 0 ? (currentTime.value / duration.value) * 100 : 0)
  const bufferedPct = computed(() => duration.value > 0 ? (buffered.value / duration.value) * 100 : 0)

  function controlsIdleMs() {
    if (!import.meta.client) return CONTROLS_IDLE_MS
    return isTouchDevice.value ? MOBILE_CONTROLS_IDLE_MS : CONTROLS_IDLE_MS
  }

  const progressStore = useEpisodePlayerProgress({
    videoRef,
    malId: props.malId,
    currentEpisodeNum,
    episodes: props.episodes,
    duration,
    progressKey,
  })

  const skip = useEpisodePlayerSkip({
    malId: props.malId,
    currentEpisodeNum,
    autoSkip,
    skipTimes,
    videoRef,
  })

  const volumeControls = useEpisodePlayerVolume({ videoRef, volume, isMuted, showVolume, volumeIndicator })

  const fullscreen = useEpisodePlayerFullscreen({ containerRef, isFullscreen, resetIdle, cancelAutoNext })

  const keyboard = useEpisodePlayerKeyboard({
    videoRef,
    togglePlay,
    seekRelative,
    showSeekFeedback,
    changeVolume: volumeControls.changeVolume,
    toggleMute: volumeControls.toggleMute,
    toggleFullscreen: fullscreen.toggleFullscreen,
  })

  const mediaSession = useEpisodePlayerMediaSession({
    getTitle: () => episode.value.title,
    getEpisodeNumber: () => currentEpisodeNum.value,
    getAlbum: () => props.animeTitle,
    getArtwork: () => episode.value.thumbnail || props.animeThumbnail,
  })

  async function resetForEpisode() {
    const epoch = ++resetEpoch
    clearAnyTimer(countdownTimer)
    resetPlaybackTracking()
    countdownTimer = null
    progressStore.resetSave()
    source.clearResume()
    autoNextCountdown.value = null
    currentTime.value = 0
    duration.value = 0
    buffered.value = 0
    isPlaying.value = source.autoPlayWanted()
    isSeeking.value = false
    seekIndicator.value = null
    scrubPreview.value = null
    resolving.value = true
    loadingMessage.value = 'Menyiapkan player...'
    pendingStartHide = true
    skip.resetSkip()
    clearGestureState()
    resetQuality()

    const pendingReset = (async () => {
      try {
        const resume = await progressStore.savedResumeTime()
        if (epoch !== resetEpoch) return
        source.setResume(resume)
        watchedMarked = (await getEpisodeStatus(progressKey.value)) === 'completed'
      }
      catch {}
    })()
    resetSettled = pendingReset
    await pendingReset
    if (resetSettled === pendingReset) resetSettled = null
  }

  async function saveNextEpisodeResume() {
    if (!nextEpisode.value) return
    await saveProgress(`${props.malId}:${nextEpisode.value.num}`, {
      currentTime: 0,
      duration: 1,
      malId: props.malId,
      episodeNumber: nextEpisode.value.num,
      latestEpisode: progressStore.latestAvailableEpisode(),
    })
  }

  async function doMark() {
    if (watchedMarked) return
    watchedMarked = true
    await markWatched(progressKey.value, progressStore.currentProgressPayload())
    clearWatchedTimer()
  }

  function shouldHideControlsOnIdle() {
    return !isSeeking.value && !showEpisodes.value && Boolean(videoRef.value && !videoRef.value.paused)
  }

  function resetIdle(ms = controlsIdleMs()) {
    if (speedBoost.value) return hideControlsNow()
    showControls.value = true
    clearIdleTimer()
    idleTimer = setTimeout(hideControlsIfIdle, ms)
  }

  function hideControlsIfIdle() {
    if (shouldHideControlsOnIdle()) hideControlsNow()
  }

  function toggleEpisodesPanel() {
    showEpisodes.value = !showEpisodes.value
    if (showEpisodes.value && idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
    } else resetIdle()
  }

  function toggleControlsVisibility() {
    if (speedBoost.value || showControls.value) return hideControlsNow()
    resetIdle()
  }

  function hideControlsNow() {
    showControls.value = false
    showEpisodes.value = false
    clearIdleTimer()
  }

  const {
    invalidatePlaybackSession,
    playWithFallback,
    triggerFallback,
  } = useEpisodePlayerResolution({
    activeQuality,
    directUrl,
    directKind,
    episode,
    loadingMessage,
    resolving,
  })

  const source = useEpisodePlayerSource({
    videoRef,
    directUrl,
    directKind,
    videoLoading,
    loadingMessage,
    triggerFallback,
  })

  const { reset: resetQuality, start: startQuality, stop: stopQuality } = useEpisodePlayerQuality({
    videoRef,
    levels: qualityLevels,
    activeQuality,
    isSwitching: () => resolving.value,
    bufferAhead,
    bandwidthEstimate: source.bandwidthEstimate,
    onSelect: applyQuality,
  })

  function applyQuality(level: MirrorCandidate) {
    const video = videoRef.value
    source.setAutoPlay(!!video && !video.paused)
    if (video && video.currentTime > 0) source.setResume(video.currentTime)
    void playWithFallback(level, false, true)
  }

  function toggleAutoSkip() {
    autoSkip.value = !autoSkip.value
    void setAutoSkip(autoSkip.value)
  }

  async function loadEpisodeInPlace(epNum: number, shouldAutoPlay = false) {
    invalidatePlaybackSession()
    resetEpoch++
    resetQuality()
    resolving.value = true
    loadingMessage.value = 'Menyiapkan episode...'
    directUrl.value = null
    directKind.value = null
    source.setAutoPlay(shouldAutoPlay)
    source.clearResume()
    source.destroyHls()
    const video = videoRef.value
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    let data: EpisodePageData | null = null
    try {
      data = await $fetch<EpisodePageData | null>(`/api/anime/${props.malId}/${epNum}`)
    }
    catch {
      resolving.value = false
      return
    }
    if (!data) {
      resolving.value = false
      return
    }
    episode.value = data.episode
    currentEpisodeNum.value = data.episodeNumber
    window.history.replaceState(null, '', `/anime/${props.malId}/${data.episodeNumber}`)
    document.title = `${data.episode.title} - Nimeplay`
  }

  function navigateEpisode(epNum: number) {
    if (isFullscreen.value) loadEpisodeInPlace(epNum, !!videoRef.value && !videoRef.value.paused)
    else router.replace(`/anime/${props.malId}/${epNum}`)
  }

  function cancelAutoNext() {
    if (countdownTimer) clearInterval(countdownTimer)
    countdownTimer = null
    autoNextCountdown.value = null
  }

  function startAutoNextCountdown() {
    autoNextCountdown.value = 5
    countdownTimer = setInterval(() => {
      if (autoNextCountdown.value === null) return
      if (!isFullscreen.value) return cancelAutoNext()
      if (autoNextCountdown.value <= 1) goNextNow()
      else autoNextCountdown.value -= 1
    }, 1000)
  }

  function goNextNow() {
    cancelAutoNext()
    if (!nextEpisode.value) return
    if (isFullscreen.value) void loadEpisodeInPlace(nextEpisode.value.num, true)
    else router.replace(`/anime/${props.malId}/${nextEpisode.value.num}`)
  }

  function togglePlay() {
    const video = videoRef.value
    if (isPlaying.value) {
      isPlaying.value = false
      source.setAutoPlay(false)
      videoLoading.value = false
      video?.pause()
      return
    }
    isPlaying.value = true
    source.setAutoPlay(true)
    if (video && video.readyState >= 2) void video.play().catch(() => {})
    else videoLoading.value = true
  }

  function seekTo(time: number) {
    const video = videoRef.value
    if (!video) return
    video.currentTime = Math.max(0, Math.min(time, video.duration || 0))
  }

  function seekRelative(delta: number) {
    const video = videoRef.value
    if (!video) return
    const newTime = Math.max(0, Math.min(video.currentTime + delta, video.duration || 0))
    currentTime.value = newTime
    video.currentTime = newTime
  }

  function showSeekFeedback(side: 'left' | 'right', seconds: number) {
    if (seekIndicatorTimer) clearTimeout(seekIndicatorTimer)
    seekIndicator.value = { side, seconds }
    seekIndicatorKey.value++
    seekIndicatorTimer = setTimeout(() => { seekIndicator.value = null }, 600)
  }

  function clearIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = null
  }

  const {
    clearPlaybackTimers,
    clearWatchedTimer,
    registerVideoEvents,
    resetPlaybackTracking,
  } = useEpisodePlayerMediaEvents({
    isPlaying,
    isSeeking,
    currentTime,
    duration,
    buffered,
    volume,
    isMuted,
    isFullscreen,
    videoLoading,
    nextEpisode,
    skipTimes,
    autoSkipCurrentSegment: skip.autoSkipCurrentSegment,
    canMarkWatched: () => !watchedMarked,
    doMark,
    doSaveProgress: progressStore.doSaveProgress,
    fetchSkipTimesIfNeeded: skip.fetchSkipTimesIfNeeded,
    saveNextEpisodeResume,
    startAutoNextCountdown,
    onPlaybackStart: onPlaybackStarted,
  })

  const {
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
  } = useEpisodePlayerGestures({
    videoRef,
    currentTime,
    duration,
    isSeeking,
    showControls,
    controlsVisible,
    showEpisodes,
    speedBoost,
    wasLongPress,
    seekIndicator,
    seekIndicatorKey,
    scrubPreview,
    clearIdleTimer,
    resetIdle,
    seekRelative,
    seekTo,
    setHlsMaxBufferLength: source.setHlsMaxBufferLength,
    toggleControlsVisibility,
    togglePlay,
    toggleFullscreen: fullscreen.toggleFullscreen,
  })

  watch(progressKey, resetForEpisode, { immediate: true })

  function loadEpisodeSource(value: EpisodeData) {
    if (!import.meta.client) return
    const def = pickInitialQuality(qualityLevels.value) ?? findDefaultMirror(value)
    if (!def) {
      resolving.value = false
      return
    }
    const gate = resetSettled
    if (!gate) {
      void playWithFallback(def, false)
      return
    }
    void gate.catch(() => {}).then(() => {
      void playWithFallback(def, false)
    })
  }

  watch(episode, loadEpisodeSource, { immediate: true })

  watch(autoSkip, (value) => {
    if (import.meta.client) void setAutoSkip(value)
  })

  function showPausedControls() {
    showControls.value = true
    clearIdleTimer()
  }

  function onPlaybackStarted() {
    videoLoading.value = false
    if (pendingStartHide) {
      pendingStartHide = false
      resetIdle(START_CONTROLS_IDLE_MS)
    }
    else resetIdle()
  }

  function updatePlayingState(playing: boolean) {
    if (playing) onPlaybackStarted()
    else showPausedControls()
    mediaSession.setMediaPlaybackState(playing)
  }

  watch(isPlaying, updatePlayingState)

  watch([() => episode.value.title, () => currentEpisodeNum.value], mediaSession.updateMediaMetadata, { immediate: true })

  function prefetchNextEpisode() {
    const target = nextEpisode.value
    if (!target || !import.meta.client) return
    const run = () => {
      $fetch<EpisodePageData | null>(`/api/anime/${props.malId}/${target.num}`).catch(() => {})
    }
    if ('requestIdleCallback' in window) (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(run, { timeout: 2000 })
    else setTimeout(run, 1500)
  }

  onMounted(() => {
    isTouchDevice.value = window.matchMedia('(hover: none) and (pointer: coarse)').matches || navigator.maxTouchPoints > 0
    getAutoSkip().then((val) => { autoSkip.value = val })
    preloadHls()
    startQuality()
    prefetchNextEpisode()
    const video = videoRef.value
    if (video) onBeforeUnmount(registerVideoEvents(video))

    const onFullscreenChange = () => {
      isFullscreen.value = !!document.fullscreenElement
      if (isFullscreen.value) resetIdle()
      if (!isFullscreen.value) {
        cancelAutoNext()
        void fullscreen.lockPlayerOrientation('portrait')
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (!showNative.value) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (keyboard.isInteractiveTarget(target)) return
      keyboard.handleKeyboardShortcut(event)
    }
    const onPointerActivity = () => resetIdle()
    const onLeave = () => {
      if (isSeeking.value) return
      if (videoRef.value && !videoRef.value.paused) {
        showControls.value = false
        showEpisodes.value = false
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    window.addEventListener('keydown', onKey)
    containerRef.value?.addEventListener('mousemove', onPointerActivity)
    containerRef.value?.addEventListener('mouseleave', onLeave)

    mediaSession.installHandlers({ videoRef, seekRelative, prevEpisode, nextEpisode, navigateEpisode })

    onBeforeUnmount(() => {
      progressStore.doSaveProgress()
      const current = videoRef.value
      if (current) {
        try { current.pause() } catch {}
        current.removeAttribute('src')
        try { current.load() } catch {}
      }
      source.destroyHls()
      stopQuality()
      invalidatePlaybackSession()
      clearAnyTimer(countdownTimer)
      clearAnyTimer(idleTimer)
      volumeControls.resetVolumeTimers()
      clearAnyTimer(seekIndicatorTimer)
      clearPlaybackTimers()
      clearGestureState()
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      window.removeEventListener('keydown', onKey)
      containerRef.value?.removeEventListener('mousemove', onPointerActivity)
      containerRef.value?.removeEventListener('mouseleave', onLeave)
      if (isFullscreen.value || document.fullscreenElement) void fullscreen.exitPlayerFullscreen()
      if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
    })
  })

  return {
    autoNextCountdown,
    autoSkip,
    bufferedPct,
    changeVolume: volumeControls.changeVolume,
    containerRef,
    controlsVisible,
    currentEpisodeNum,
    currentTime,
    duration,
    episode,
    formatTime,
    getEpisodeStatus,
    goNextNow,
    handleVideoPointerCancel,
    handleVideoPointerDown,
    handleVideoPointerMove,
    handleVideoPointerUp,
    handleVideoTouchCancel,
    handleVideoTouchEnd,
    handleVideoTouchMove,
    handleVideoTouchStart,
    hideVolumeControl: volumeControls.hideVolumeControl,
    isFullscreen,
    isMuted,
    isPlaying,
    isSeeking,
    loadingMessage,
    navigateEpisode,
    nextEpisode,
    onSeekCommit,
    onSeekPreview,
    onSeekStart,
    prevEpisode,
    progress,
    cancelAutoNext,
    resolving,
    scrubPreview,
    seekIndicator,
    seekIndicatorKey,
    showControls,
    showEmpty,
    showEpisodes,
    showLoading,
    showNative,
    showVolume,
    showVolumeControl: volumeControls.showVolumeControl,
    skipTimes,
    speedBoost,
    toggleAutoSkip,
    toggleEpisodesPanel,
    toggleFullscreen: fullscreen.toggleFullscreen,
    toggleMute: volumeControls.toggleMute,
    togglePlay,
    videoRef,
    volume,
    volumeIndicator,
    wasLongPress,
  }
}

import { Capacitor } from '@capacitor/core'
import { fetchMalId, fetchSkipTimes } from '~/utils/aniskip'
import type { EpisodeData, SkipTime } from '~/utils/types'

export interface EpisodePlayerProps {
  episode: EpisodeData
  currentSlug: string
  animeSlug: string
  animeThumbnail: string
  currentEpisodeNum: string
}

function clearAnyTimer(timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null) {
  if (timer) clearTimeout(timer)
}

function isAndroidNative() {
  return import.meta.client && Capacitor.getPlatform() === 'android'
}

const CONTROLS_IDLE_MS = 3000
const MOBILE_CONTROLS_IDLE_MS = 5000
const INTERACTIVE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function useEpisodePlayer(props: EpisodePlayerProps) {
  const router = useRouter()

  const episode = ref(props.episode)
  const currentSlug = ref(props.currentSlug)
  const currentEpisodeNum = ref(props.currentEpisodeNum)
  const directUrl = ref<string | null>(null)
  const iframeSrc = ref<string | null>(null)
  const useIframe = ref(false)
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
  const showEmbedAlert = ref(true)
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
  const volumeIndicator = ref<{ volume: number; isMuted: boolean } | null>(null)
  const speedBoost = ref(false)
  const wasLongPress = ref(false)

  const containerRef = ref<HTMLDivElement | null>(null)
  const videoRef = ref<HTMLVideoElement | null>(null)

  let hls: any | null = null
  let watchedMarked = false
  let iframeTimer: ReturnType<typeof setTimeout> | null = null
  let autoPlayOnLoad = false
  let resumeTime = 0
  let lastSavedTime = 0
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let countdownTimer: ReturnType<typeof setInterval> | null = null
  let volumeTimer: ReturnType<typeof setTimeout> | null = null
  let volumeIndicatorTimer: ReturnType<typeof setTimeout> | null = null
  let seekIndicatorTimer: ReturnType<typeof setTimeout> | null = null
  let skipFetched = false

  function episodeAtOffset(offset: number) {
    const ascending = [...episode.value.episodeNav].reverse()
    const idx = ascending.findIndex((ep) => ep.slug === currentSlug.value)
    const target = idx === -1 ? null : ascending[idx + offset]
    return target ? { slug: target.slug, num: getEpNum(episode.value.episodeNav, target.slug) } : null
  }

  const nextEpisode = computed(() => {
    return episodeAtOffset(1)
  })

  const prevEpisode = computed(() => {
    return episodeAtOffset(-1)
  })

  const qualityOptions = computed(() => {
    const qualityOrder = ['1080p', '720p', '480p', '360p']
    const sorted = [...episode.value.mirrors].sort((a, b) => {
      const ai = qualityOrder.indexOf(a.quality)
      const bi = qualityOrder.indexOf(b.quality)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
    return sorted.slice(0, 2).map((mirror) => {
      const bestSource = [...mirror.sources].sort((a, b) => sourcePriority(a.name) - sourcePriority(b.name))[0]
      const label = ['720p', '1080p'].includes(mirror.quality) ? 'HD' : 'SD'
      return bestSource ? { quality: mirror.quality, label, dataContent: bestSource.dataContent, name: bestSource.name } : null
    }).filter((item): item is { quality: string; label: string; dataContent: string; name: string } => item !== null)
  })

  const activeQualityLabel = computed(() => qualityOptions.value.find((opt) => opt.quality === activeQuality.value)?.label ?? 'HD')
  const showNative = computed(() => !!directUrl.value && !useIframe.value)
  const showIframe = computed(() => useIframe.value && !!iframeSrc.value)
  const showEmpty = computed(() => !showNative.value && !showIframe.value && !resolving.value)
  const showLoading = computed(() => resolving.value || (showNative.value && videoLoading.value))
  const controlsVisible = computed(() => !speedBoost.value && (showControls.value || !isPlaying.value))
  const progress = computed(() => duration.value > 0 ? (currentTime.value / duration.value) * 100 : 0)
  const bufferedPct = computed(() => duration.value > 0 ? (buffered.value / duration.value) * 100 : 0)

  function controlsIdleMs() {
    if (!import.meta.client) return CONTROLS_IDLE_MS
    return isTouchDevice.value ? MOBILE_CONTROLS_IDLE_MS : CONTROLS_IDLE_MS
  }

  function destroyHls() {
    if (hls) {
      hls.destroy()
      hls = null
    }
  }

  function setHlsMaxBufferLength(length: number) {
    if (hls) hls.config.maxBufferLength = length
  }

  async function resetForEpisode() {
    clearAnyTimer(iframeTimer)
    clearAnyTimer(countdownTimer)
    resetPlaybackTracking()
    iframeTimer = null
    countdownTimer = null
    lastSavedTime = 0
    resumeTime = await savedResumeTime()
    autoNextCountdown.value = null
    currentTime.value = 0
    duration.value = 0
    buffered.value = 0
    isPlaying.value = false
    isSeeking.value = false
    seekIndicator.value = null
    resolving.value = true
    loadingMessage.value = 'Menyiapkan player...'
    watchedMarked = (await getEpisodeStatus(currentSlug.value)) === 'completed'
    skipFetched = false
    skipTimes.value = []
    showEmbedAlert.value = true
    clearGestureState()
  }

  async function savedResumeTime() {
    const saved = await getProgress(currentSlug.value)
    if (!saved || (await getEpisodeStatus(currentSlug.value)) !== 'in_progress') return 0
    return saved.currentTime > 0 ? saved.currentTime : 0
  }

  function hasFiniteDuration(video: HTMLVideoElement | null) {
    return Boolean(video?.duration && Number.isFinite(video.duration))
  }

  async function doSaveProgress() {
    const video = videoRef.value
    if (!video || !hasFiniteDuration(video)) return
    if (video.currentTime === lastSavedTime) return
    lastSavedTime = video.currentTime
    await saveProgress(currentSlug.value, {
      currentTime: video.currentTime,
      duration: video.duration,
      animeSlug: props.animeSlug,
      episodeNum: currentEpisodeNum.value,
    })
  }

  async function saveNextEpisodeResume() {
    if (!nextEpisode.value) return
    await saveProgress(nextEpisode.value.slug, {
      currentTime: 0,
      duration: 1,
      animeSlug: props.animeSlug,
      episodeNum: nextEpisode.value.num,
    })
  }

  function progressFallbackDuration() {
    return duration.value || 1
  }

  function progressCurrentTime(fallback: number) {
    const video = videoRef.value
    return video ? video.currentTime : fallback
  }

  function progressDuration(fallback: number) {
    const video = videoRef.value
    if (!hasFiniteDuration(video)) return fallback
    return video?.duration ?? fallback
  }

  function currentProgressPayload() {
    const fallbackDuration = progressFallbackDuration()
    return {
      currentTime: progressCurrentTime(fallbackDuration),
      duration: progressDuration(fallbackDuration),
      animeSlug: props.animeSlug,
      episodeNum: currentEpisodeNum.value,
    }
  }

  function clearWatchTimers() {
    clearWatchedTimer()
    clearAnyTimer(iframeTimer)
    iframeTimer = null
  }

  async function doMark() {
    if (watchedMarked) return
    watchedMarked = true
    await markWatched(currentSlug.value, currentProgressPayload())
    clearWatchTimers()
  }

  function shouldHideControlsOnIdle() {
    return !isSeeking.value && !showEpisodes.value && Boolean(videoRef.value && !videoRef.value.paused)
  }

  function resetIdle() {
    if (speedBoost.value) return hideControlsNow()
    showControls.value = true
    clearIdleTimer()
    idleTimer = setTimeout(hideControlsIfIdle, controlsIdleMs())
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
    activateIframe,
    invalidatePlaybackSession,
    playWithFallback,
    triggerFallback,
  } = useEpisodePlayerResolution({
    activeQuality,
    directUrl,
    episode,
    iframeSrc,
    loadingMessage,
    resolving,
    useIframe,
  })

  function switchQuality(opt: { dataContent: string; quality: string; name: string }) {
    const video = videoRef.value
    autoPlayOnLoad = !!video && !video.paused
    if (video && video.currentTime > 0) resumeTime = video.currentTime
    void playWithFallback(opt, false, true)
  }

  function toggleQuality() {
    if (qualityOptions.value.length < 2) return
    const next = qualityOptions.value.find((o) => o.quality !== activeQuality.value) ?? qualityOptions.value[0]
    if (!next) return
    switchQuality(next)
  }

  function toggleAutoSkip() {
    autoSkip.value = !autoSkip.value
    void setAutoSkip(autoSkip.value)
  }

  async function loadEpisodeInPlace(slug: string, epNum: string, shouldAutoPlay = false) {
    invalidatePlaybackSession()
    resolving.value = true
    loadingMessage.value = 'Menyiapkan episode...'
    directUrl.value = null
    useIframe.value = false
    iframeSrc.value = null
    autoPlayOnLoad = shouldAutoPlay
    resumeTime = 0
    destroyHls()
    const video = videoRef.value
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    const data = await $fetch<EpisodeData | null>(`/api/episode/${slug}`)
    if (!data) {
      resolving.value = false
      return
    }
    episode.value = data
    currentSlug.value = slug
    currentEpisodeNum.value = epNum
    window.history.replaceState(null, '', `/${props.animeSlug}/${epNum}`)
    document.title = data.title
  }

  function navigateEpisode(slug: string, epNum: string) {
    if (isFullscreen.value) loadEpisodeInPlace(slug, epNum, !!videoRef.value && !videoRef.value.paused)
    else router.push(`/${props.animeSlug}/${epNum}`)
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
    if (isFullscreen.value) void loadEpisodeInPlace(nextEpisode.value.slug, nextEpisode.value.num, true)
    else router.push(`/${props.animeSlug}/${nextEpisode.value.num}`)
  }

  function togglePlay() {
    const video = videoRef.value
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
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

  function toggleMute() {
    if (videoRef.value) videoRef.value.muted = !videoRef.value.muted
    showVolumeIndicator()
  }

  function showVolumeIndicator() {
    const video = videoRef.value
    if (!video) return
    clearTimeout(volumeIndicatorTimer)
    volumeIndicator.value = { volume: video.volume, isMuted: video.muted }
    volumeIndicatorTimer = setTimeout(() => { volumeIndicator.value = null }, 1000)
  }

  function changeVolume(v: number) {
    const video = videoRef.value
    if (!video) return
    video.volume = Math.max(0, Math.min(1, v))
    if (video.muted && v > 0) video.muted = false
    showVolumeIndicator()
  }

  function showSeekFeedback(side: 'left' | 'right', seconds: number) {
    clearTimeout(seekIndicatorTimer)
    seekIndicator.value = { side, seconds }
    seekIndicatorKey.value++
    seekIndicatorTimer = setTimeout(() => { seekIndicator.value = null }, 600)
  }

  async function lockPlayerOrientation(orientation: 'landscape' | 'portrait') {
    if (isAndroidNative()) {
      try {
        const { ScreenOrientation } = await import('@capacitor/screen-orientation')
        await ScreenOrientation.lock({ orientation })
        return
      } catch (error) { console.warn('ScreenOrientation.lock failed', error) }
    }

    try {
      if (orientation === 'landscape') await (screen.orientation as unknown as { lock: (o: string) => Promise<void> }).lock('landscape')
      else (screen.orientation as unknown as { unlock: () => void }).unlock()
    } catch (error) { console.warn('screen.orientation lock/unlock failed', error) }
  }

  async function exitPlayerFullscreen() {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen() } catch (error) { console.warn('exitFullscreen failed', error) }
    }
    isFullscreen.value = false
    cancelAutoNext()
    await lockPlayerOrientation('portrait')
  }

  async function toggleFullscreen() {
    const el = containerRef.value
    if (!el) return
    if (isFullscreen.value || document.fullscreenElement) {
      await exitPlayerFullscreen()
      return
    }

    const nativeAndroid = isAndroidNative()
    if (nativeAndroid) await lockPlayerOrientation('landscape')
    try { await el.requestFullscreen() } catch (error) { console.warn('requestFullscreen failed', error) }
    if (!nativeAndroid) await lockPlayerOrientation('landscape')

    if (nativeAndroid || document.fullscreenElement) {
      isFullscreen.value = true
      resetIdle()
    }
  }

  function clearIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = null
  }

  function showVolumeControl() {
    if (volumeTimer) clearTimeout(volumeTimer)
    showVolume.value = true
  }

  function hideVolumeControl() {
    volumeTimer = setTimeout(() => { showVolume.value = false }, 300)
  }

  function isInteractiveTarget(target: HTMLElement | null) {
    return Boolean(target && (INTERACTIVE_TAGS.has(target.tagName) || target.closest('a, button, [role="button"]')))
  }

  function isPlayPauseKey(event: KeyboardEvent) {
    return ['Enter', ' ', 'MediaPlayPause'].includes(event.key) || [23, 66].includes(event.keyCode)
  }

  function handleKeyboardShortcut(event: KeyboardEvent) {
    if (!isPlaying.value && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return false

    const volume = videoRef.value?.volume ?? 1
    const shortcuts: Record<string, () => void> = {
      k: togglePlay,
      ArrowLeft: () => { seekRelative(-5); showSeekFeedback('left', 5) },
      ArrowRight: () => { seekRelative(5); showSeekFeedback('right', 5) },
      ArrowUp: () => changeVolume(volume + 0.1),
      ArrowDown: () => changeVolume(volume - 0.1),
      m: toggleMute,
      f: () => { void toggleFullscreen() },
    }
    const handler = shortcuts[keyboardShortcutKey(event)]
    if (!handler) return false
    event.preventDefault()
    handler()
    return true
  }

  function keyboardShortcutKey(event: KeyboardEvent) {
    return event.key.length === 1 ? event.key.toLowerCase() : event.key
  }

  async function lookupAndSaveSkipTimes(epNum: number, episodeLength: number) {
    const key = `lookup:${episode.value.title}:${epNum}`
    const cached = await getFreshSkipTimes(key)
    if (cached) {
      skipTimes.value = cached
      return
    }
    const malId = await fetchMalId(episode.value.title)
    const skipTimeData = malId ? await fetchSkipTimes(malId, epNum, episodeLength) : []
    if (malId) await saveMalId(episode.value.animeSlug || props.animeSlug, malId)
    if (import.meta.client) await setSkipTimes(key, skipTimeData)
    skipTimes.value = skipTimeData
  }

  async function loadSkipTimes(epNum: number, episodeLength: number, malId: number | null) {
    if (!malId) return lookupAndSaveSkipTimes(epNum, episodeLength)
    const key = `${malId}:${epNum}`
    const cached = await getFreshSkipTimes(key)
    if (cached) {
      skipTimes.value = cached
      return
    }
    const data = await fetchSkipTimes(malId, epNum, episodeLength)
    if (import.meta.client) await setSkipTimes(key, data)
    skipTimes.value = data
  }

  function shouldSkipSegment(skipTime: SkipTime, time: number) {
    return time >= skipTime.interval.startTime && time < skipTime.interval.endTime - 1
  }

  function autoSkipCurrentSegment(video: HTMLVideoElement) {
    if (!autoSkip.value) return
    const current = skipTimes.value.find((skipTime) => shouldSkipSegment(skipTime, video.currentTime))
    if (current) video.currentTime = current.interval.endTime
  }

  async function fetchSkipTimesIfNeeded() {
    if (skipFetched) return
    const episodeLength = currentVideoDuration()
    if (episodeLength === null) return
    skipFetched = true
    const epNum = extractEpisodeNumber(currentSlug.value)
    if (!epNum) return
    await loadSkipTimes(epNum, episodeLength, await getMalId(currentAnimeSlug()))
  }

  function currentAnimeSlug() {
    return episode.value.animeSlug || props.animeSlug
  }

  function currentVideoDuration() {
    const video = videoRef.value
    return hasFiniteDuration(video) ? video?.duration ?? null : null
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
    nextEpisode,
    skipTimes,
    autoSkipCurrentSegment,
    canMarkWatched: () => !watchedMarked,
    doMark,
    doSaveProgress,
    fetchSkipTimesIfNeeded,
    saveNextEpisodeResume,
    startAutoNextCountdown,
  })

  const {
    clearGestureState,
    handleSpeedHoldStart,
    handleZonePointerUp,
    handleZoneTouchEnd,
    handleZoneTap,
    onProgressDown,
  } = useEpisodePlayerGestures({
    videoRef,
    currentTime,
    duration,
    isSeeking,
    showControls,
    showEpisodes,
    speedBoost,
    wasLongPress,
    seekIndicator,
    seekIndicatorKey,
    clearIdleTimer,
    resetIdle,
    seekRelative,
    seekTo,
    setHlsMaxBufferLength,
    toggleControlsVisibility,
    toggleFullscreen,
  })

  watch(currentSlug, resetForEpisode, { immediate: true })

  function activateEpisodeFallback(value: EpisodeData) {
    if (value.defaultIframeSrc) activateIframe(value.defaultIframeSrc)
    resolving.value = false
  }

  function loadEpisodeSource(value: EpisodeData) {
    const def = findDefaultMirror(value)
    if (!def) return activateEpisodeFallback(value)
    void playWithFallback(def, false)
  }

  watch(episode, loadEpisodeSource, { immediate: true })

  watch(showIframe, (shown) => {
    if (iframeTimer) clearTimeout(iframeTimer)
    iframeTimer = null
    if (shown && !watchedMarked) iframeTimer = setTimeout(doMark, 30_000)
  })

  watch(autoSkip, (value) => {
    if (import.meta.client) void setAutoSkip(value)
  })

  function setMediaPlaybackState(playing: boolean) {
    if (import.meta.client && 'mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
  }

  function showPausedControls() {
    showControls.value = true
    clearIdleTimer()
  }

  function updatePlayingState(playing: boolean) {
    if (playing) resetIdle()
    else showPausedControls()
    setMediaPlaybackState(playing)
  }

  watch(isPlaying, updatePlayingState)

  function mediaArtwork() {
    const artworkUrl = episode.value.thumbnail || props.animeThumbnail
    return artworkUrl ? [96, 192, 256, 384, 512].map((size) => ({ src: artworkUrl, sizes: `${size}x${size}`, type: 'image/jpeg' })) : []
  }

  function updateMediaMetadata() {
    if (!import.meta.client || !('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: episode.value.title,
      artist: episode.value.animeTitle,
      album: `Episode ${currentEpisodeNum.value}`,
      artwork: mediaArtwork(),
    })
  }

  watch([() => episode.value.title, () => currentEpisodeNum.value], updateMediaMetadata, { immediate: true })

  function proxyLoaderFor(url: string) {
    return url.includes('vidhide') || url.includes('odvidhide') ? { pLoader: ProxyPlaylistLoader as any } : {}
  }

  function attachNativeSource(video: HTMLVideoElement, url: string, onVideoError: () => void) {
    video.src = url
    video.addEventListener('error', onVideoError, { once: true })
  }

  async function attachHlsSource(video: HTMLVideoElement, url: string, onVideoError: () => void) {
    const Hls = (await import('hls.js/light')).default
    if (Hls.isSupported()) {
      hls = new Hls({
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        ...proxyLoaderFor(url),
      })
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, (_: unknown, data: { fatal?: boolean }) => {
        if (data.fatal) triggerFallback()
      })
      return
    }
    if (video.canPlayType('application/vnd.apple.mpegurl')) return attachNativeSource(video, url, onVideoError)
    triggerFallback()
  }

  function resumeAndAutoplay(video: HTMLVideoElement) {
    if (resumeTime > 0) {
      video.currentTime = resumeTime
      resumeTime = 0
    }
    if (!autoPlayOnLoad) return
    autoPlayOnLoad = false
    if (video.paused) void video.play().catch(() => {})
  }

  async function attachVideoSource(video: HTMLVideoElement, url: string, onVideoError: () => void) {
    if (url.includes('.m3u8')) return attachHlsSource(video, url, onVideoError)
    attachNativeSource(video, url, onVideoError)
  }

  watch(directUrl, async (url, _, onCleanup) => {
    const video = videoRef.value
    if (!video || !url) return
    loadingMessage.value = 'Memuat video...'
    videoLoading.value = true
    destroyHls()
    const onCanPlay = () => { videoLoading.value = false }
    const onVideoError = () => triggerFallback()
    video.addEventListener('canplay', onCanPlay, { once: true })

    await attachVideoSource(video, url, onVideoError)

    const onReady = () => resumeAndAutoplay(video)
    video.addEventListener('canplay', onReady, { once: true })
    onCleanup(() => {
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('error', onVideoError)
      destroyHls()
    })
  })

  onMounted(() => {
    isTouchDevice.value = window.matchMedia('(hover: none) and (pointer: coarse)').matches || navigator.maxTouchPoints > 0
    getAutoSkip().then((val) => { autoSkip.value = val })
    const video = videoRef.value
    if (video) onBeforeUnmount(registerVideoEvents(video))

    const onFullscreenChange = () => {
      isFullscreen.value = !!document.fullscreenElement
      if (isFullscreen.value) resetIdle()
      if (!isFullscreen.value) {
        cancelAutoNext()
        void lockPlayerOrientation('portrait')
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (!showNative.value) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (isInteractiveTarget(target)) return
      if (isPlayPauseKey(event)) {
        event.preventDefault()
        togglePlay()
        return
      }
      handleKeyboardShortcut(event)
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

    if ('mediaSession' in navigator) {
      const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
        try { navigator.mediaSession.setActionHandler(action, handler) } catch (error) { console.warn('mediaSession.setActionHandler failed', error) }
      }
      setHandler('play', () => { if (videoRef.value) void videoRef.value.play() })
      setHandler('pause', () => videoRef.value?.pause())
      setHandler('seekbackward', (details) => seekRelative(-(details.seekOffset ?? 10)))
      setHandler('seekforward', (details) => seekRelative(details.seekOffset ?? 10))
      setHandler('previoustrack', () => { if (prevEpisode.value) navigateEpisode(prevEpisode.value.slug, prevEpisode.value.num) })
      setHandler('nexttrack', () => { if (nextEpisode.value) navigateEpisode(nextEpisode.value.slug, nextEpisode.value.num) })
    }

    onBeforeUnmount(() => {
      doSaveProgress()
      destroyHls()
      invalidatePlaybackSession()
      clearAnyTimer(iframeTimer)
      clearAnyTimer(countdownTimer)
      clearAnyTimer(idleTimer)
      clearAnyTimer(volumeTimer)
      clearAnyTimer(volumeIndicatorTimer)
      clearAnyTimer(seekIndicatorTimer)
      clearPlaybackTimers()
      clearGestureState()
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      window.removeEventListener('keydown', onKey)
      containerRef.value?.removeEventListener('mousemove', onPointerActivity)
      containerRef.value?.removeEventListener('mouseleave', onLeave)
      if (isFullscreen.value || document.fullscreenElement) void exitPlayerFullscreen()
      if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
    })
  })

  return {
    activeQualityLabel,
    autoNextCountdown,
    autoSkip,
    bufferedPct,
    changeVolume,
    containerRef,
    controlsVisible,
    currentEpisodeNum,
    currentSlug,
    currentTime,
    duration,
    episode,
    episodeNumFor,
    formatTime,
    getEpisodeStatus,
    goNextNow,
    handleSpeedHoldStart,
    handleZonePointerUp,
    handleZoneTouchEnd,
    handleZoneTap,
    hideVolumeControl,
    iframeSrc,
    isFullscreen,
    isMuted,
    isPlaying,
    isSeeking,
    loadingMessage,
    navigateEpisode,
    nextEpisode,
    onProgressDown,
    prevEpisode,
    progress,
    qualityOptions,
    cancelAutoNext,
    seekIndicator,
    seekIndicatorKey,
    showControls,
    showEmbedAlert,
    showEmpty,
    showEpisodes,
    showIframe,
    showLoading,
    showNative,
    showVolume,
    showVolumeControl,
    skipTimes,
    speedBoost,
    toggleAutoSkip,
    toggleEpisodesPanel,
    toggleFullscreen,
    toggleMute,
    togglePlay,
    toggleQuality,
    useIframe,
    videoRef,
    volume,
    volumeIndicator,
    wasLongPress,
  }
}

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from '#app'
import type { EpisodeData, SkipTime } from '~/utils/types'
import { getEpisodeStatus, getProgress, markWatched, saveProgress } from '~/utils/watchHistory'
import { getMalId, saveMalId } from '~/utils/jikanCache'
import {
  buildFallbackOrder,
  episodeNumFor,
  extractEpisodeNumber,
  findDefaultMirror,
  formatTime,
  getEpNum,
  isExtractable,
  ProxyPlaylistLoader,
  sourcePriority,
  type MirrorCandidate,
} from '~/utils/player'

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

const CONTROLS_IDLE_MS = 3000
const MOBILE_CONTROLS_IDLE_MS = 5000

export function useEpisodePlayer(props: EpisodePlayerProps) {
  const router = useRouter()
  const trpc = useTrpc()

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
  const speedBoost = ref(false)
  const wasLongPress = ref(false)

  const containerRef = ref<HTMLDivElement | null>(null)
  const videoRef = ref<HTMLVideoElement | null>(null)

  let hls: any | null = null
  let fallbackFn: (() => void) | null = null
  let playbackSession = 0
  let fallbackRunning = false
  let watchedMarked = false
  let playSeconds = 0
  let playTimer: ReturnType<typeof setInterval> | null = null
  let iframeTimer: ReturnType<typeof setTimeout> | null = null
  let autoPlayOnLoad = false
  let resumeTime = 0
  let progressSaveTimer: ReturnType<typeof setInterval> | null = null
  let lastSavedTime = 0
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let countdownTimer: ReturnType<typeof setInterval> | null = null
  let volumeTimer: ReturnType<typeof setTimeout> | null = null
  let seekIndicatorTimer: ReturnType<typeof setTimeout> | null = null
  let seekAccumulator = 0
  let skipFetched = false
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressActive = false
  let seeking = false
  const lastTap = { left: 0, center: 0, right: 0 }
  const tapTimers: Record<'left' | 'center' | 'right', ReturnType<typeof setTimeout> | null> = { left: null, center: null, right: null }

  function clearTapTimer(zone: 'left' | 'center' | 'right') {
    if (tapTimers[zone]) clearTimeout(tapTimers[zone])
    tapTimers[zone] = null
  }

  function clearTapTimers() {
    clearTapTimer('left')
    clearTapTimer('center')
    clearTapTimer('right')
  }

  const nextEpisode = computed(() => {
    const ascending = [...episode.value.episodeNav].reverse()
    const idx = ascending.findIndex((ep) => ep.slug === currentSlug.value)
    if (idx !== -1 && idx + 1 < ascending.length) {
      const next = ascending[idx + 1]
      if (!next) return null
      return { slug: next.slug, num: getEpNum(episode.value.episodeNav, next.slug) }
    }
    return null
  })

  const prevEpisode = computed(() => {
    const ascending = [...episode.value.episodeNav].reverse()
    const idx = ascending.findIndex((ep) => ep.slug === currentSlug.value)
    if (idx > 0) {
      const prev = ascending[idx - 1]
      if (!prev) return null
      return { slug: prev.slug, num: getEpNum(episode.value.episodeNav, prev.slug) }
    }
    return null
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
  const controlsVisible = computed(() => showControls.value || !isPlaying.value)
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

  function resetForEpisode() {
    clearAnyTimer(playTimer)
    clearAnyTimer(iframeTimer)
    clearAnyTimer(countdownTimer)
    clearAnyTimer(progressSaveTimer)
    playTimer = null
    iframeTimer = null
    countdownTimer = null
    progressSaveTimer = null
    playSeconds = 0
    lastSavedTime = 0
    resumeTime = 0
    seeking = false
    seekAccumulator = 0
    autoNextCountdown.value = null
    currentTime.value = 0
    duration.value = 0
    buffered.value = 0
    isPlaying.value = false
    isSeeking.value = false
    seekIndicator.value = null
    resolving.value = true
    loadingMessage.value = 'Menyiapkan player...'
    watchedMarked = getEpisodeStatus(currentSlug.value) === 'completed'
    const saved = getProgress(currentSlug.value)
    if (saved && getEpisodeStatus(currentSlug.value) === 'in_progress' && saved.currentTime > 0) resumeTime = saved.currentTime
    skipFetched = false
    skipTimes.value = []
    showEmbedAlert.value = true
    if (longPressTimer) clearTimeout(longPressTimer)
    longPressTimer = null
    clearTapTimers()
    longPressActive = false
    wasLongPress.value = false
    speedBoost.value = false
  }

  function doSaveProgress() {
    const video = videoRef.value
    if (!video || !video.duration || !Number.isFinite(video.duration)) return
    if (video.currentTime === lastSavedTime) return
    lastSavedTime = video.currentTime
    saveProgress(currentSlug.value, {
      currentTime: video.currentTime,
      duration: video.duration,
      animeSlug: props.animeSlug,
      episodeNum: currentEpisodeNum.value,
    })
  }

  function saveNextEpisodeResume() {
    if (!nextEpisode.value) return
    saveProgress(nextEpisode.value.slug, {
      currentTime: 0,
      duration: 1,
      animeSlug: props.animeSlug,
      episodeNum: nextEpisode.value.num,
    })
  }

  function doMark() {
    if (watchedMarked) return
    watchedMarked = true
    const video = videoRef.value
    markWatched(currentSlug.value, {
      currentTime: video?.currentTime ?? (duration.value || 1),
      duration: video?.duration && Number.isFinite(video.duration) ? video.duration : (duration.value || 1),
      animeSlug: props.animeSlug,
      episodeNum: currentEpisodeNum.value,
    })
    clearAnyTimer(playTimer)
    clearAnyTimer(iframeTimer)
    playTimer = null
    iframeTimer = null
  }

  function resetIdle() {
    showControls.value = true
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (seeking) return
      if (showEpisodes.value) return
      if (videoRef.value && !videoRef.value.paused) {
        showControls.value = false
        showEpisodes.value = false
      }
    }, controlsIdleMs())
  }

  function toggleEpisodesPanel() {
    showEpisodes.value = !showEpisodes.value
    if (showEpisodes.value && idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
    } else resetIdle()
  }

  function toggleControlsVisibility() {
    if (showControls.value) {
      showControls.value = false
      showEpisodes.value = false
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = null
    } else resetIdle()
  }

  function triggerFallback() {
    fallbackFn?.()
  }

  async function tryMirror(candidate: MirrorCandidate, sessionId: number): Promise<boolean> {
    if (sessionId !== playbackSession) return false
    activeQuality.value = candidate.quality
    try {
      const shouldExtract = isExtractable(candidate.name)
      const prepared = await trpc.prepareMirror.mutate({ dataContent: candidate.dataContent, extract: shouldExtract })
      const iframeUrl = prepared?.iframeUrl
      if (sessionId !== playbackSession || !iframeUrl) return false
      iframeSrc.value = iframeUrl

      if (!shouldExtract) {
        if (sessionId !== playbackSession || !prepared.ok) return false
        directUrl.value = null
        useIframe.value = true
        return true
      }

      const proxiedUrl = prepared.proxiedUrl
      if (sessionId !== playbackSession) return false
      if (proxiedUrl) {
        useIframe.value = false
        directUrl.value = proxiedUrl
        return true
      }
      if (iframeUrl.includes('desustream.info')) {
        directUrl.value = null
        useIframe.value = true
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function playWithFallback(startCandidate: MirrorCandidate, manual: boolean, seamless = false) {
    const sessionId = ++playbackSession
    fallbackRunning = false
    loadingMessage.value = seamless ? 'Mengganti kualitas...' : 'Menyiapkan player...'
    if (!seamless) {
      resolving.value = true
      useIframe.value = false
      directUrl.value = null
    }

    const candidates = manual ? [startCandidate] : [
      startCandidate,
      ...buildFallbackOrder(episode.value.mirrors, startCandidate.quality, startCandidate.name),
    ]
    let fallbackIdx = 1

    fallbackFn = () => {
      if (fallbackRunning || sessionId !== playbackSession) return
      fallbackRunning = true
      ;(async () => {
        try {
          while (fallbackIdx < candidates.length) {
            if (sessionId !== playbackSession) return
            const next = candidates[fallbackIdx++]
            if (!next) break
            resolving.value = true
            loadingMessage.value = 'Mencoba sumber video lain...'
            useIframe.value = false
            directUrl.value = null
            const ok = await tryMirror(next, sessionId)
            if (sessionId !== playbackSession) return
            if (ok) {
              resolving.value = false
              return
            }
          }
          if (sessionId === playbackSession) {
            if (iframeSrc.value || episode.value.defaultIframeSrc) {
              iframeSrc.value ||= episode.value.defaultIframeSrc
              useIframe.value = true
            }
            resolving.value = false
          }
        } finally {
          if (sessionId === playbackSession) fallbackRunning = false
        }
      })()
    }

    let resolved = await tryMirror(startCandidate, sessionId)
    if (sessionId !== playbackSession) return
    if (!resolved) {
      while (fallbackIdx < candidates.length) {
        loadingMessage.value = 'Mencoba sumber video lain...'
        const next = candidates[fallbackIdx++]
        if (!next) break
        resolved = await tryMirror(next, sessionId)
        if (sessionId !== playbackSession) return
        if (resolved) break
      }
    }
    if (!resolved && sessionId === playbackSession) {
      if (iframeSrc.value || episode.value.defaultIframeSrc) {
        iframeSrc.value ||= episode.value.defaultIframeSrc
        directUrl.value = null
        useIframe.value = true
      }
    }
    if (sessionId === playbackSession) fallbackRunning = false
    resolving.value = false
  }

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
    localStorage.setItem('nimeplay:autoskip', autoSkip.value ? '1' : '0')
  }

  async function loadEpisodeInPlace(slug: string, epNum: string, shouldAutoPlay = false) {
    playbackSession += 1
    fallbackFn = null
    fallbackRunning = false
    resolving.value = true
    loadingMessage.value = 'Menyiapkan episode...'
    directUrl.value = null
    useIframe.value = false
    iframeSrc.value = null
    autoPlayOnLoad = shouldAutoPlay
    resumeTime = 0
    seeking = false
    destroyHls()
    const video = videoRef.value
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    const data = await trpc.episode.query({ slug })
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
  }

  function changeVolume(v: number) {
    const video = videoRef.value
    if (!video) return
    video.volume = Math.max(0, Math.min(1, v))
    if (video.muted && v > 0) video.muted = false
  }

  async function toggleFullscreen() {
    const el = containerRef.value
    if (!el) return
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      try { (screen.orientation as unknown as { unlock: () => void }).unlock() } catch {}
    } else {
      await el.requestFullscreen()
      try { await (screen.orientation as unknown as { lock: (o: string) => Promise<void> }).lock('landscape') } catch {}
    }
  }

  function showSeekFeedback(side: 'left' | 'right', seconds: number) {
    if (seekIndicatorTimer) clearTimeout(seekIndicatorTimer)
    seekAccumulator += seconds
    seekIndicator.value = { side, seconds: seekAccumulator }
    seekIndicatorKey.value++
    seekIndicatorTimer = setTimeout(() => {
      seekIndicator.value = null
      seekAccumulator = 0
    }, 600)
  }

  function handleZoneTap(zone: 'left' | 'center' | 'right') {
    const now = Date.now()
    const isDoubleTap = now - lastTap[zone] < 300
    lastTap[zone] = now

    if (zone === 'center') {
      if (isDoubleTap) {
        clearTapTimer('center')
        void toggleFullscreen()
      } else {
        tapTimers.center = setTimeout(() => {
          tapTimers.center = null
          toggleControlsVisibility()
        }, 300)
      }
      return
    }
    const side = zone
    if (isDoubleTap) {
      clearTapTimer(side)
      const delta = side === 'left' ? -10 : 10
      seekRelative(delta)
      showSeekFeedback(side, Math.abs(delta))
    } else {
      tapTimers[side] = setTimeout(() => {
        tapTimers[side] = null
        toggleControlsVisibility()
      }, 300)
    }
  }

  function handleZonePointerUp(zone: 'left' | 'center' | 'right', event: PointerEvent) {
    if (event.pointerType === 'touch') return
    if (event.button !== 0) return
    event.preventDefault()
    if (zone === 'right' && wasLongPress.value) return
    handleZoneTap(zone)
  }

  function handleZoneTouchEnd(zone: 'left' | 'center' | 'right', event: TouchEvent) {
    event.preventDefault()
    if (zone === 'right' && wasLongPress.value) return
    handleZoneTap(zone)
  }

  function handleSpeedHoldStart() {
    const video = videoRef.value
    if (!video || video.paused) return
    if (longPressTimer) clearTimeout(longPressTimer)
    longPressActive = false
    longPressTimer = setTimeout(() => {
      longPressActive = true
      wasLongPress.value = true
      const v = videoRef.value
      if (!v) return
      if (hls) hls.config.maxBufferLength = 120
      v.playbackRate = 3
      speedBoost.value = true
    }, 400)
    const end = () => {
      if (longPressTimer) clearTimeout(longPressTimer)
      longPressTimer = null
      if (longPressActive) {
        longPressActive = false
        const v = videoRef.value
        if (v) v.playbackRate = 1
        if (hls) hls.config.maxBufferLength = 60
        speedBoost.value = false
      }
      setTimeout(() => { wasLongPress.value = false }, 50)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  function getSeekTime(clientX: number, bar: HTMLElement | null): number | null {
    if (!bar || !duration.value) return null
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return ratio * duration.value
  }

  function onProgressDown(event: MouseEvent | TouchEvent) {
    event.preventDefault()
    const bar = event.currentTarget as HTMLElement | null
    seeking = true
    isSeeking.value = true
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = null
    const touch = 'touches' in event ? event.touches[0] : null
    const clientX = touch ? touch.clientX : 'clientX' in event ? event.clientX : null
    if (clientX === null) return
    const time = getSeekTime(clientX, bar)
    if (time !== null) currentTime.value = time
    const onMove = (ev: MouseEvent | TouchEvent) => {
      const moveTouch = 'touches' in ev ? ev.touches[0] : null
      const cx = moveTouch ? moveTouch.clientX : 'clientX' in ev ? ev.clientX : null
      if (cx === null) return
      const t = getSeekTime(cx, bar)
      if (t !== null) currentTime.value = t
    }
    const onUp = (ev: MouseEvent | TouchEvent) => {
      const changedTouch = 'changedTouches' in ev ? ev.changedTouches[0] : null
      const cx = changedTouch ? changedTouch.clientX : 'clientX' in ev ? ev.clientX : null
      if (cx === null) return
      const t = getSeekTime(cx, bar)
      if (t !== null) seekTo(t)
      seeking = false
      isSeeking.value = false
      resetIdle()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('touchend', onUp)
  }

  function showVolumeControl() {
    if (volumeTimer) clearTimeout(volumeTimer)
    showVolume.value = true
  }

  function hideVolumeControl() {
    volumeTimer = setTimeout(() => { showVolume.value = false }, 300)
  }

  async function fetchSkipTimesIfNeeded() {
    const video = videoRef.value
    if (skipFetched || !video?.duration || !Number.isFinite(video.duration)) return
    skipFetched = true
    const epNum = extractEpisodeNumber(currentSlug.value)
    if (!epNum) return
    let malId = getMalId(episode.value.animeSlug || props.animeSlug)
    if (!malId) {
      const res = await trpc.skipTimesLookup.query({ title: episode.value.title, episode: epNum, episodeLength: video.duration })
      malId = res.malId
      if (malId) saveMalId(episode.value.animeSlug || props.animeSlug, malId)
      skipTimes.value = res.skipTimes
      return
    }
    if (!malId) return
    skipTimes.value = await trpc.skipTimes.query({ malId, episode: epNum, episodeLength: video.duration })
  }

  watch(currentSlug, resetForEpisode, { immediate: true })

  watch(episode, (value) => {
    const def = findDefaultMirror(value)
    if (def) void playWithFallback(def, false)
    else {
      if (value.defaultIframeSrc) {
        iframeSrc.value = value.defaultIframeSrc
        useIframe.value = true
      }
      resolving.value = false
    }
  }, { immediate: true })

  watch(showIframe, (shown) => {
    if (iframeTimer) clearTimeout(iframeTimer)
    iframeTimer = null
    if (shown && !watchedMarked) iframeTimer = setTimeout(doMark, 30_000)
  })

  watch(autoSkip, (value) => {
    if (import.meta.client) localStorage.setItem('nimeplay:autoskip', value ? '1' : '0')
  })

  watch(isPlaying, (playing) => {
    if (playing) resetIdle()
    else {
      showControls.value = true
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = null
    }
    if (import.meta.client && 'mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
  })

  watch([() => episode.value.title, () => currentEpisodeNum.value], () => {
    if (!import.meta.client || !('mediaSession' in navigator)) return
    const artworkUrl = episode.value.thumbnail || props.animeThumbnail
    navigator.mediaSession.metadata = new MediaMetadata({
      title: episode.value.title,
      artist: episode.value.animeTitle,
      album: `Episode ${currentEpisodeNum.value}`,
      artwork: artworkUrl ? [96, 192, 256, 384, 512].map((size) => ({ src: artworkUrl, sizes: `${size}x${size}`, type: 'image/jpeg' })) : [],
    })
  }, { immediate: true })

  watch(directUrl, async (url, _, onCleanup) => {
    const video = videoRef.value
    if (!video || !url) return
    loadingMessage.value = 'Memuat video...'
    videoLoading.value = true
    destroyHls()
    const onCanPlay = () => { videoLoading.value = false }
    const onVideoError = () => triggerFallback()
    video.addEventListener('canplay', onCanPlay, { once: true })

    if (url.includes('.m3u8')) {
      const Hls = (await import('hls.js/light')).default
      if (Hls.isSupported()) {
        const needsProxy = url.includes('vidhide') || url.includes('odvidhide')
        hls = new Hls({
          maxBufferLength: 60,
          maxMaxBufferLength: 120,
          ...(needsProxy ? { pLoader: ProxyPlaylistLoader as any } : {}),
        })
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(Hls.Events.ERROR, (_: unknown, data: { fatal?: boolean }) => {
          if (data.fatal) triggerFallback()
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url
        video.addEventListener('error', onVideoError, { once: true })
      } else triggerFallback()
    } else {
      video.src = url
      video.addEventListener('error', onVideoError, { once: true })
    }

    const onReady = () => {
      if (resumeTime > 0) {
        video.currentTime = resumeTime
        resumeTime = 0
      }
      if (autoPlayOnLoad) {
        autoPlayOnLoad = false
        if (video.paused) void video.play().catch(() => {})
      }
    }
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
    autoSkip.value = localStorage.getItem('nimeplay:autoskip') === '1'
    const video = videoRef.value
    if (video) {
      const onPlay = () => {
        isPlaying.value = true
        if (!watchedMarked && !playTimer) {
          playTimer = setInterval(() => {
            playSeconds += 1
            if (playSeconds >= 10) doMark()
          }, 1000)
        }
        if (!progressSaveTimer) progressSaveTimer = setInterval(doSaveProgress, 5000)
      }
      const onPause = () => {
        isPlaying.value = false
        doSaveProgress()
        clearAnyTimer(playTimer)
        clearAnyTimer(progressSaveTimer)
        playTimer = null
        progressSaveTimer = null
      }
      const onEnded = () => {
        isPlaying.value = false
        doSaveProgress()
        doMark()
        saveNextEpisodeResume()
        clearAnyTimer(playTimer)
        clearAnyTimer(progressSaveTimer)
        playTimer = null
        progressSaveTimer = null
        if (isFullscreen.value && nextEpisode.value) {
          autoNextCountdown.value = 5
          countdownTimer = setInterval(() => {
            if (autoNextCountdown.value === null) return
            if (!isFullscreen.value) return cancelAutoNext()
            if (autoNextCountdown.value <= 1) goNextNow()
            else autoNextCountdown.value -= 1
          }, 1000)
        }
      }
      const onTimeUpdate = () => {
        if (!seeking) currentTime.value = video.currentTime
        if (skipTimes.value.length > 0 && autoSkip.value) {
          const current = skipTimes.value.find((s) => video.currentTime >= s.interval.startTime && video.currentTime < s.interval.endTime - 1)
          if (current) video.currentTime = current.interval.endTime
        }
      }
      const onDurationChange = () => {
        if (video.duration && Number.isFinite(video.duration)) duration.value = video.duration
        void fetchSkipTimesIfNeeded()
      }
      const onProgress = () => {
        if (video.buffered.length > 0) buffered.value = video.buffered.end(video.buffered.length - 1)
      }
      const onVolumeChange = () => {
        volume.value = video.volume
        isMuted.value = video.muted
      }
      video.addEventListener('play', onPlay)
      video.addEventListener('pause', onPause)
      video.addEventListener('ended', onEnded)
      video.addEventListener('timeupdate', onTimeUpdate)
      video.addEventListener('durationchange', onDurationChange)
      video.addEventListener('progress', onProgress)
      video.addEventListener('volumechange', onVolumeChange)

      onBeforeUnmount(() => {
        video.removeEventListener('play', onPlay)
        video.removeEventListener('pause', onPause)
        video.removeEventListener('ended', onEnded)
        video.removeEventListener('timeupdate', onTimeUpdate)
        video.removeEventListener('durationchange', onDurationChange)
        video.removeEventListener('progress', onProgress)
        video.removeEventListener('volumechange', onVolumeChange)
      })
    }

    const onFullscreenChange = () => {
      isFullscreen.value = !!document.fullscreenElement
      if (isFullscreen.value) resetIdle()
      if (!isFullscreen.value) {
        cancelAutoNext()
        try { (screen.orientation as unknown as { unlock: () => void }).unlock() } catch {}
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (!showNative.value) return
      const tag = (event.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      switch (event.key) {
        case ' ':
        case 'k':
        case 'K': event.preventDefault(); togglePlay(); break
        case 'ArrowLeft': event.preventDefault(); seekRelative(-5); break
        case 'ArrowRight': event.preventDefault(); seekRelative(5); break
        case 'ArrowUp': event.preventDefault(); changeVolume((videoRef.value?.volume ?? 1) + 0.1); break
        case 'ArrowDown': event.preventDefault(); changeVolume((videoRef.value?.volume ?? 1) - 0.1); break
        case 'm':
        case 'M': event.preventDefault(); toggleMute(); break
        case 'f':
        case 'F': event.preventDefault(); void toggleFullscreen(); break
      }
    }
    const onPointerActivity = () => resetIdle()
    const onLeave = () => {
      if (seeking) return
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
        try { navigator.mediaSession.setActionHandler(action, handler) } catch {}
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
      fallbackFn = null
      playbackSession += 1
      clearAnyTimer(playTimer)
      clearAnyTimer(iframeTimer)
      clearAnyTimer(countdownTimer)
      clearAnyTimer(progressSaveTimer)
      clearAnyTimer(idleTimer)
      clearAnyTimer(volumeTimer)
      clearAnyTimer(seekIndicatorTimer)
      clearTapTimers()
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      window.removeEventListener('keydown', onKey)
      containerRef.value?.removeEventListener('mousemove', onPointerActivity)
      containerRef.value?.removeEventListener('mouseleave', onLeave)
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
    wasLongPress,
  }
}

import type Hls from 'hls.js'
import type { EpisodeData, EpisodePageData, MirrorCandidate, SkipTime } from '#lib/types'
import { loadEpisode } from '#lib/remote/episode.remote'
import { loadHls } from './hls'
import {
  bufferedEndAt,
  buildFallbackOrder,
  findDefaultMirror,
  hasFiniteDuration,
  listQualityLevels,
  qualityBitrate,
} from './media'
import { fetchSkipTimes } from '#lib/skip'
import {
  getAutoSkip,
  getEpisodeStatus,
  getProgress,
  markWatched,
  progressKey,
  saveProgress,
  setAutoSkip,
} from '#lib/storage'

export interface EpisodePlayerProps {
  malId: number
  episodeNumber: number
  episode: EpisodeData
  episodes: number[]
  animeTitle: string
  animeThumbnail: string
}

type SeekIndicator = { side: 'left' | 'right'; seconds: number } | null
type TapZone = 'left' | 'center' | 'right'

const CONTROLS_IDLE_MS = 3000
const MOBILE_CONTROLS_IDLE_MS = 5000
const START_CONTROLS_IDLE_MS = 1200
const CENTER_ICON_PX = 64
const CENTER_MARGIN_PX = 32
const CENTER_HIT_PX = CENTER_ICON_PX + CENTER_MARGIN_PX * 2
const CENTER_BAND_RATIO = 0.3

const NETWORK_RATES: Record<string, number> = {
  'slow-2g': 300_000,
  '2g': 600_000,
  '3g': 2_000_000,
  '4g': 8_000_000,
}
const SAFETY_MARGIN = 0.7
const CHECK_INTERVAL_MS = 1_000
const STALL_THRESHOLD_MS = 5_000
const DOWNGRADE_COOLDOWN_MS = 30_000
const UPGRADE_COOLDOWN_MS = 60_000
const SMOOTH_UPGRADE_MS = 20_000
const BUFFER_HEALTHY = 12

function isInteractiveTarget(target: HTMLElement | null) {
  if (!target) return false
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true
  return Boolean(target.closest('a, button, [role="button"], [role="slider"]'))
}

function networkBandwidth(): number | null {
  if (typeof navigator === 'undefined') return null
  const connection = (
    navigator as Navigator & {
      connection?: { downlink?: number; effectiveType?: string; saveData?: boolean }
    }
  ).connection
  if (!connection) return null
  if (connection.saveData) return 0
  if (typeof connection.downlink === 'number' && connection.downlink > 0) return connection.downlink * 1_000_000
  return connection.effectiveType ? (NETWORK_RATES[connection.effectiveType] ?? null) : null
}

function controlsIdleMs() {
  if (typeof window === 'undefined') return CONTROLS_IDLE_MS
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches ? MOBILE_CONTROLS_IDLE_MS : CONTROLS_IDLE_MS
}

function shouldSkipSegment(skipTime: SkipTime, time: number) {
  return time >= skipTime.interval.startTime && time < skipTime.interval.endTime - 1
}

async function attachNativeSource(video: HTMLVideoElement, url: string, onVideoError: () => void) {
  video.src = url
  video.addEventListener('error', onVideoError, { once: true })
}

async function lockPlayerOrientation(orientation: 'landscape' | 'portrait') {
  try {
    if (orientation === 'landscape')
      await (screen.orientation as unknown as { lock: (o: string) => Promise<void> }).lock('landscape')
    else (screen.orientation as unknown as { unlock: () => void }).unlock()
  } catch (error) {
    console.warn('screen.orientation lock/unlock failed', error)
  }
}

function setMediaPlaybackState(playing: boolean) {
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator)
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
}

function setMediaHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
  try {
    navigator.mediaSession.setActionHandler(action, handler)
  } catch (error) {
    console.warn('mediaSession.setActionHandler failed', error)
  }
}

function getZone(clientX: number, el: HTMLElement): TapZone {
  const box = el.getBoundingClientRect()
  if (!box || box.width <= 0 || box.height <= 0) return 'center'
  const ratio = (clientX - box.left) / box.width
  if (ratio < CENTER_BAND_RATIO) return 'left'
  if (ratio < 1 - CENTER_BAND_RATIO) return 'center'
  return 'right'
}

function isInCenterHitbox(clientX: number, clientY: number, el: HTMLElement): boolean {
  const box = el.getBoundingClientRect()
  if (!box || box.width <= 0 || box.height <= 0) return false
  const dx = clientX - (box.left + box.width / 2)
  const dy = clientY - (box.top + box.height / 2)
  return Math.abs(dx) <= CENTER_HIT_PX / 2 && Math.abs(dy) <= CENTER_HIT_PX / 2
}

function clearAnyTimer(timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null) {
  if (timer) clearTimeout(timer)
}

export function createEpisodePlayer(getProps: () => EpisodePlayerProps, onNavigate: (url: string) => void) {
  let episode = $state<EpisodeData>({ ...getProps().episode })
  let currentEpisodeNum = $state(getProps().episodeNumber)
  let directUrl = $state<string | null>(null)
  let directKind = $state<'hls' | 'file' | null>(null)
  let activeQuality = $state('720p')
  let resolving = $state(true)
  let videoLoading = $state(true)
  let loadingMessage = $state('Menyiapkan player...')
  let skipTimes = $state<SkipTime[]>([])
  let autoSkip = $state(false)
  let isPlaying = $state(false)
  let autoNextCountdown = $state<number | null>(null)
  let showControls = $state(true)
  let showEpisodes = $state(false)
  let currentTime = $state(0)
  let duration = $state(0)
  let buffered = $state(0)
  let volume = $state(1)
  let isMuted = $state(false)
  let isFullscreen = $state(false)
  let isSeeking = $state(false)
  let showVolume = $state(false)
  let seekIndicator = $state<SeekIndicator>(null)
  let seekIndicatorKey = $state(0)
  let volumeIndicator = $state<{ volume: number; isMuted: boolean } | null>(null)
  let speedBoost = $state(false)
  let wasLongPress = $state(false)

  let containerRef: HTMLDivElement | null = $state(null)
  let videoRef: HTMLVideoElement | null = $state(null)

  const setContainer = (el: HTMLDivElement | null) => {
    containerRef = el
  }
  const setVideo = (el: HTMLVideoElement | null) => {
    videoRef = el
  }

  let hls: Hls | null = null
  let resumeTime = 0
  let autoPlayOnLoad = true
  let playbackSession = 0
  let fallbackFn: (() => void) | null = null
  let fallbackRunning = false
  let watchedMarked = false
  let lastSavedTime = 0
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let pendingStartHide = false
  let countdownTimer: ReturnType<typeof setInterval> | null = null
  let volumeTimer: ReturnType<typeof setTimeout> | null = null
  let volumeIndicatorTimer: ReturnType<typeof setTimeout> | null = null
  let seekIndicatorTimer: ReturnType<typeof setTimeout> | null = null
  let playTimer: ReturnType<typeof setInterval> | null = null
  let progressSaveTimer: ReturnType<typeof setInterval> | null = null
  let playSeconds = 0
  let qualityTimer: ReturnType<typeof setInterval> | null = null
  let resetEpoch = 0
  let resetSettled: Promise<void> | null = null
  let videoCleanup: (() => void) | null = null
  let lastTap = { left: 0, center: 0, right: 0 }
  let pendingSingleTap: ReturnType<typeof setTimeout> | null = null
  let pendingWasVisible: boolean | null = null
  let seekAccumulator = 0
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressActive = false
  let previewSeekTimer: ReturnType<typeof setTimeout> | null = null
  let touchTracking = false
  let touchDownZone: TapZone = 'center'
  let touchInCenterHitbox = false
  let touchStartX = 0
  let touchStartY = 0
  let touchMoved = false
  let mouseDown = false
  let mouseDownZone: TapZone = 'center'
  let mouseDownInCenterHitbox = false
  let mouseDownX = 0
  let mouseDownY = 0
  let mousePointerId: number | null = null
  let bufferingSince: number | null = null
  let stalled = false
  let smoothSince = Date.now()
  let lastDowngradeAt = 0
  let lastUpgradeAt = 0

  const progressStoreKey = $derived(progressKey(getProps().malId, currentEpisodeNum))
  const qualityLevels = $derived(listQualityLevels(episode.sources))

  function episodeAtOffset(offset: number) {
    const list = getProps().episodes
    const idx = list.indexOf(currentEpisodeNum)
    const target = idx === -1 ? null : list[idx + offset]
    return target ? { num: target } : null
  }

  const nextEpisode = $derived(episodeAtOffset(1))
  const prevEpisode = $derived(episodeAtOffset(-1))
  const showNative = $derived(!!directUrl)
  const showEmpty = $derived(!showNative && !resolving)
  const showLoading = $derived(resolving || (showNative && videoLoading))
  const controlsVisible = $derived(!speedBoost && (showControls || !isPlaying))
  const progress = $derived(duration > 0 ? (currentTime / duration) * 100 : 0)
  const bufferedPct = $derived(duration > 0 ? (buffered / duration) * 100 : 0)

  function bufferAhead() {
    const video = videoRef
    if (!video || video.buffered.length === 0) return 0
    return Math.max(0, bufferedEndAt(video) - video.currentTime)
  }

  function latestAvailableEpisode() {
    const list = getProps().episodes
    return list.length ? Math.max(...list) : undefined
  }

  function currentProgressPayload() {
    const video = videoRef
    const fallbackDuration = duration || 1
    return {
      currentTime: video ? video.currentTime : fallbackDuration,
      duration: video && hasFiniteDuration(video) ? video.duration : fallbackDuration,
      malId: getProps().malId,
      episodeNumber: currentEpisodeNum,
      latestEpisode: latestAvailableEpisode(),
    }
  }

  async function doSaveProgress() {
    const video = videoRef
    if (!video || !hasFiniteDuration(video)) return
    if (video.currentTime === lastSavedTime) return
    lastSavedTime = video.currentTime
    await saveProgress(progressStoreKey, {
      currentTime: video.currentTime,
      duration: video.duration,
      malId: getProps().malId,
      episodeNumber: currentEpisodeNum,
      latestEpisode: latestAvailableEpisode(),
    })
  }

  async function savedResumeTime() {
    const saved = await getProgress(progressStoreKey)
    if (!saved || (await getEpisodeStatus(progressStoreKey)) !== 'in_progress') return 0
    return saved.currentTime > 0 ? saved.currentTime : 0
  }

  async function doMark() {
    if (watchedMarked) return
    watchedMarked = true
    await markWatched(progressStoreKey, currentProgressPayload())
    clearWatchedTimer()
  }

  function autoSkipCurrentSegment(video: HTMLVideoElement) {
    if (!autoSkip) return
    const current = skipTimes.find(skipTime => shouldSkipSegment(skipTime, video.currentTime))
    if (current) video.currentTime = current.interval.endTime
  }

  let skipFetched = false

  async function fetchSkipTimesIfNeeded() {
    if (skipFetched) return
    const video = videoRef
    if (!video || !hasFiniteDuration(video)) return
    skipFetched = true
    const epNum = currentEpisodeNum
    if (!epNum || !video.duration) return
    skipTimes.splice(0, skipTimes.length, ...(await fetchSkipTimes(getProps().malId, epNum, video.duration)))
  }

  function resetSkip() {
    skipFetched = false
    skipTimes.splice(0, skipTimes.length)
  }

  function showVolumeControl() {
    if (volumeTimer) clearTimeout(volumeTimer)
    showVolume = true
  }

  function hideVolumeControl() {
    volumeTimer = setTimeout(() => {
      showVolume = false
    }, 300)
  }

  function showVolumeIndicator() {
    const video = videoRef
    if (!video) return
    if (volumeIndicatorTimer) clearTimeout(volumeIndicatorTimer)
    volumeIndicator = { volume: video.volume, isMuted: video.muted }
    volumeIndicatorTimer = setTimeout(() => {
      volumeIndicator = null
    }, 1000)
  }

  function toggleMute() {
    if (videoRef) videoRef.muted = !videoRef.muted
    showVolumeIndicator()
  }

  function changeVolume(v: number) {
    const clamped = Math.max(0, Math.min(1, v))
    volume = clamped
    if (clamped > 0) isMuted = false
    const video = videoRef
    if (!video) return
    video.volume = clamped
    if (video.muted && clamped > 0) video.muted = false
    showVolumeIndicator()
  }

  function togglePlay() {
    const video = videoRef
    const playing = video ? !video.paused : isPlaying
    if (playing) {
      isPlaying = false
      autoPlayOnLoad = false
      videoLoading = false
      video?.pause()
      return
    }
    isPlaying = true
    autoPlayOnLoad = true
    if (video && video.readyState >= 2) {
      void video.play().catch(() => {
        isPlaying = false
      })
    } else {
      videoLoading = true
    }
  }

  function seekTo(time: number) {
    const video = videoRef
    if (!video) return
    video.currentTime = Math.max(0, Math.min(time, video.duration || 0))
  }

  function seekRelative(delta: number) {
    const video = videoRef
    if (!video) return
    const newTime = Math.max(0, Math.min(video.currentTime + delta, video.duration || 0))
    currentTime = newTime
    video.currentTime = newTime
  }

  function showSeekFeedback(side: 'left' | 'right', seconds: number) {
    if (seekIndicatorTimer) clearTimeout(seekIndicatorTimer)
    seekAccumulator += seconds
    seekIndicator = { side, seconds: seekAccumulator }
    seekIndicatorKey++
    seekIndicatorTimer = setTimeout(() => {
      seekIndicator = null
      seekAccumulator = 0
    }, 800)
  }

  function clearIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = null
  }

  function hideControlsNow() {
    showControls = false
    showEpisodes = false
    clearIdleTimer()
  }

  function shouldHideControlsOnIdle() {
    return !isSeeking && !showEpisodes && Boolean(videoRef && !videoRef.paused)
  }

  function hideControlsIfIdle() {
    if (shouldHideControlsOnIdle()) hideControlsNow()
  }

  function resetIdle(ms = controlsIdleMs()) {
    if (speedBoost) return hideControlsNow()
    showControls = true
    clearIdleTimer()
    idleTimer = setTimeout(hideControlsIfIdle, ms)
  }

  function toggleControlsVisibility() {
    if (speedBoost || showControls) return hideControlsNow()
    resetIdle()
  }

  function toggleEpisodesPanel() {
    showEpisodes = !showEpisodes
    if (showEpisodes && idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
    } else resetIdle()
  }

  // resolution
  function invalidatePlaybackSession() {
    playbackSession += 1
    fallbackFn = null
    fallbackRunning = false
  }

  function isCurrentSession(sessionId: number) {
    return sessionId === playbackSession
  }

  function activateDirectUrl(url: string | null | undefined, kind: 'hls' | 'file' | null) {
    if (!url) return false
    directUrl = url
    directKind = kind
    return true
  }

  async function prepareCandidate(candidate: MirrorCandidate) {
    const cached = episode.stream
    if (cached && cached.server === candidate.server && cached.quality === candidate.quality) {
      return { prepared: cached }
    }
    try {
      const response = await loadEpisode({
        malId: getProps().malId,
        episodeNumber: currentEpisodeNum,
        server: candidate.server,
        quality: candidate.quality,
      })
      return { prepared: response.episode.stream }
    } catch {
      return null
    }
  }

  async function tryMirror(candidate: MirrorCandidate, sessionId: number): Promise<boolean> {
    if (!isCurrentSession(sessionId)) return false
    const result = await prepareCandidate(candidate)
    if (!result || !isCurrentSession(sessionId)) return false
    const resolved = activateDirectUrl(result.prepared?.playUrl, result.prepared?.kind ?? null)
    if (resolved) activeQuality = candidate.quality
    return resolved
  }

  async function resolveCandidateAt(candidates: MirrorCandidate[], index: number, sessionId: number) {
    if (!isCurrentSession(sessionId)) return { stop: true, nextIndex: index }
    loadingMessage = 'Mencoba sumber video lain...'
    const next = candidates[index]
    if (!next) return { stop: true, nextIndex: index + 1 }
    const resolved = await tryMirror(next, sessionId)
    return { stop: !isCurrentSession(sessionId) || resolved, nextIndex: index + 1 }
  }

  async function resolveCandidateList(candidates: MirrorCandidate[], startIndex: number, sessionId: number) {
    for (let index = startIndex; index < candidates.length; index++) {
      const result = await resolveCandidateAt(candidates, index, sessionId)
      if (result.stop) return { nextIndex: result.nextIndex }
    }
    return { nextIndex: candidates.length }
  }

  function resetForFallbackAttempt(seamless: boolean) {
    loadingMessage = 'Mencoba sumber video lain...'
    if (seamless) return
    resolving = true
    directUrl = null
    directKind = null
  }

  function fallbackCandidates(startCandidate: MirrorCandidate, manual: boolean) {
    if (manual) return [startCandidate]
    return [startCandidate, ...buildFallbackOrder(episode.sources, startCandidate.quality, startCandidate)]
  }

  function startPlaybackResolution(seamless: boolean) {
    const sessionId = ++playbackSession
    fallbackRunning = false
    loadingMessage = seamless ? 'Mengganti kualitas...' : 'Menyiapkan player...'
    if (!seamless) {
      resolving = true
      directUrl = null
      directKind = null
    }
    return sessionId
  }

  async function resolveInitialPlayback(
    startCandidate: MirrorCandidate,
    candidates: MirrorCandidate[],
    fallbackIdx: number,
    sessionId: number,
  ) {
    const initialResolved = await tryMirror(startCandidate, sessionId)
    if (!isCurrentSession(sessionId) || initialResolved) return { nextIndex: fallbackIdx }
    const result = await resolveCandidateList(candidates, fallbackIdx, sessionId)
    return { nextIndex: result.nextIndex }
  }

  function installFallbackHandler(
    candidates: MirrorCandidate[],
    sessionId: number,
    getFallbackIdx: () => number,
    setFallbackIdx: (index: number) => void,
    seamless: boolean,
  ) {
    fallbackFn = () => {
      if (fallbackRunning || !isCurrentSession(sessionId)) return
      fallbackRunning = true
      void (async () => {
        try {
          resetForFallbackAttempt(seamless)
          const result = await resolveCandidateList(candidates, getFallbackIdx(), sessionId)
          setFallbackIdx(result.nextIndex)
          if (!isCurrentSession(sessionId)) return
          resolving = false
        } finally {
          if (isCurrentSession(sessionId)) fallbackRunning = false
        }
      })()
    }
  }

  function triggerFallback() {
    fallbackFn?.()
  }

  async function playWithFallback(startCandidate: MirrorCandidate, manual: boolean, seamless = false) {
    const sessionId = startPlaybackResolution(seamless)
    const candidates = fallbackCandidates(startCandidate, manual)
    let fallbackIdx = 1
    installFallbackHandler(
      candidates,
      sessionId,
      () => fallbackIdx,
      index => {
        fallbackIdx = index
      },
      seamless,
    )
    const result = await resolveInitialPlayback(startCandidate, candidates, fallbackIdx, sessionId)
    fallbackIdx = result.nextIndex
    if (!isCurrentSession(sessionId)) return
    fallbackRunning = false
    resolving = false
  }

  // source attachment
  function destroyHls() {
    if (hls) {
      hls.destroy()
      hls = null
    }
  }

  function setHlsMaxBufferLength(length: number) {
    if (hls) hls.config.maxBufferLength = length
  }

  function resumeAndAutoplay(video: HTMLVideoElement) {
    if (resumeTime > 0) {
      video.currentTime = resumeTime
      resumeTime = 0
    }
    if (!autoPlayOnLoad) return
    autoPlayOnLoad = false
    if (video.paused) {
      void video.play().catch((error: unknown) => {
        if (video.paused && error instanceof DOMException && error.name === 'NotAllowedError') {
          isPlaying = false
        }
      })
    }
  }

  async function attachHlsSource(video: HTMLVideoElement, url: string, handleError: () => void) {
    const HlsModule = (await loadHls()).default
    if (HlsModule.isSupported()) {
      const instance = new HlsModule({ maxBufferLength: 60, maxMaxBufferLength: 120 })
      hls = instance
      instance.loadSource(url)
      instance.attachMedia(video)
      instance.on(HlsModule.Events.ERROR, (_: unknown, data: { fatal?: boolean }) => {
        if (data.fatal) triggerFallback()
      })
      return
    }
    if (video.canPlayType('application/vnd.apple.mpegurl')) return attachNativeSource(video, url, handleError)
    triggerFallback()
  }

  function attachVideoSource(video: HTMLVideoElement, url: string, kind: 'hls' | 'file' | null, handleError: () => void) {
    if (kind === 'hls') return attachHlsSource(video, url, handleError)
    return attachNativeSource(video, url, handleError)
  }

  const onVideoError = () => triggerFallback()

  function detachVideoSource() {
    videoCleanup?.()
    videoCleanup = null
    destroyHls()
  }

  async function applyVideoSource() {
    const video = videoRef
    const url = directUrl
    if (!video) return
    if (!url) {
      destroyHls()
      try {
        video.pause()
        video.removeAttribute('src')
        video.load()
      } catch {}
      return
    }
    loadingMessage = 'Memuat video...'
    videoLoading = true
    destroyHls()
    let stallTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      stallTimer = null
      const el = videoRef
      if (!el || !videoLoading) return
      if (el.readyState >= 2 || !el.paused) videoLoading = false
      else triggerFallback()
    }, 15000)
    const clearStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = null
    }
    const onFirstFrame = () => {
      videoLoading = false
      clearStallTimer()
    }
    video.addEventListener('canplay', onFirstFrame, { once: true })
    video.addEventListener('loadeddata', onFirstFrame, { once: true })
    video.addEventListener('playing', onFirstFrame, { once: true })

    await attachVideoSource(video, url, directKind, onVideoError)

    if (video.readyState >= 2 || !video.paused) videoLoading = false
    if (!videoLoading) clearStallTimer()
    const onReady = () => resumeAndAutoplay(video)
    video.addEventListener('canplay', onReady)
    videoCleanup = () => {
      video.removeEventListener('canplay', onFirstFrame)
      video.removeEventListener('loadeddata', onFirstFrame)
      video.removeEventListener('playing', onFirstFrame)
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('error', onVideoError)
      clearStallTimer()
      destroyHls()
    }
  }

  // quality switching
  function bandwidthEstimate() {
    return hls?.bandwidthEstimate ?? NaN
  }

  function applyQuality(level: MirrorCandidate) {
    const video = videoRef
    autoPlayOnLoad = !!video && !video.paused
    if (video && video.currentTime > 0) resumeTime = video.currentTime
    void playWithFallback(level, false, true)
  }

  function resetQuality() {
    lastDowngradeAt = 0
    lastUpgradeAt = 0
    bufferingSince = null
    stalled = false
    smoothSince = Date.now()
  }

  function currentBandwidth(): number | null {
    const external = bandwidthEstimate()
    if (external && Number.isFinite(external) && external > 0) return external
    return networkBandwidth()
  }

  function commit(level: MirrorCandidate, now: number) {
    lastDowngradeAt = now
    lastUpgradeAt = now
    bufferingSince = null
    stalled = false
    smoothSince = now
    applyQuality(level)
  }

  function evaluateQuality() {
    const video = videoRef
    if (!video || video.paused || video.seeking || !Number.isFinite(video.duration)) return
    if (resolving) return
    const levels = qualityLevels
    if (levels.length < 2) return
    const index = levels.findIndex(level => level.quality === activeQuality)
    if (index === -1) return
    const now = Date.now()
    if (stalled || (bufferingSince !== null && now - bufferingSince >= STALL_THRESHOLD_MS)) {
      stalled = false
      if (!lastDowngradeAt || now - lastDowngradeAt >= DOWNGRADE_COOLDOWN_MS) {
        const lower = levels[index + 1]
        if (lower) commit(lower, now)
      }
      return
    }
    if (lastUpgradeAt && now - lastUpgradeAt < UPGRADE_COOLDOWN_MS) return
    if (!smoothSince || now - smoothSince < SMOOTH_UPGRADE_MS) return
    if (bufferAhead() < BUFFER_HEALTHY) return
    const higher = levels[index - 1]
    if (!higher) return
    const bandwidth = currentBandwidth()
    if (bandwidth !== null && qualityBitrate(higher.quality) > bandwidth * SAFETY_MARGIN) return
    commit(higher, now)
  }

  function startQuality() {
    resetQuality()
    if (qualityTimer) return
    qualityTimer = setInterval(evaluateQuality, CHECK_INTERVAL_MS)
  }

  function stopQuality() {
    if (qualityTimer) clearInterval(qualityTimer)
    qualityTimer = null
  }

  // fullscreen
  async function exitPlayerFullscreen() {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen()
      } catch (error) {
        console.warn('exitFullscreen failed', error)
      }
    }
    isFullscreen = false
    cancelAutoNext()
    await lockPlayerOrientation('portrait')
  }

  async function toggleFullscreen() {
    const el = containerRef
    if (!el) return
    if (isFullscreen || document.fullscreenElement) {
      await exitPlayerFullscreen()
      return
    }
    try {
      await el.requestFullscreen()
    } catch (error) {
      console.warn('requestFullscreen failed', error)
    }
    await lockPlayerOrientation('landscape')
    if (document.fullscreenElement || isFullscreen) {
      isFullscreen = true
      resetIdle()
    }
  }

  // keyboard
  function handleKeyboardShortcut(event: KeyboardEvent) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    const vol = videoRef?.volume ?? 1
    const shortcuts: Record<string, () => void> = {
      ' ': togglePlay,
      k: togglePlay,
      ArrowLeft: () => {
        seekRelative(-5)
        showSeekFeedback('left', 5)
      },
      ArrowRight: () => {
        seekRelative(5)
        showSeekFeedback('right', 5)
      },
      ArrowUp: () => changeVolume(vol + 0.1),
      ArrowDown: () => changeVolume(vol - 0.1),
      m: toggleMute,
      f: () => {
        void toggleFullscreen()
      },
    }
    const handler = shortcuts[key]
    if (!handler) return false
    event.preventDefault()
    handler()
    return true
  }

  // media session
  function artwork() {
    const url = episode.thumbnail || getProps().animeThumbnail
    if (!url) return []
    let src = url
    try {
      src = new URL(url, window.location.href).href
    } catch {}
    return [96, 192, 256, 384, 512].map(size => ({ src, sizes: `${size}x${size}`, type: 'image/jpeg' }))
  }

  function updateMediaMetadata() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: episode.title,
      artist: `Episode ${currentEpisodeNum}`,
      album: getProps().animeTitle,
      artwork: artwork(),
    })
  }

  function installMediaHandlers() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    setMediaHandler('play', () => {
      if (videoRef) void videoRef.play()
    })
    setMediaHandler('pause', () => videoRef?.pause())
    setMediaHandler('seekbackward', details => seekRelative(-(details.seekOffset ?? 10)))
    setMediaHandler('seekforward', details => seekRelative(details.seekOffset ?? 10))
    setMediaHandler('previoustrack', () => {
      if (prevEpisode) navigateEpisode(prevEpisode.num)
    })
    setMediaHandler('nexttrack', () => {
      if (nextEpisode) navigateEpisode(nextEpisode.num)
    })
  }

  // media events
  function clearWatchedTimer() {
    if (playTimer) clearInterval(playTimer)
    playTimer = null
  }

  function clearPlaybackTimers() {
    clearWatchedTimer()
    if (progressSaveTimer) clearInterval(progressSaveTimer)
    progressSaveTimer = null
  }

  function resetPlaybackTracking() {
    clearPlaybackTimers()
    playSeconds = 0
  }

  function startWatchedTimer() {
    if (watchedMarked || playTimer) return
    playTimer = setInterval(() => {
      playSeconds += 1
      if (playSeconds >= 10) void doMark()
    }, 1000)
  }

  function onPlay() {
    isPlaying = true
    onPlaybackStarted()
    startWatchedTimer()
    if (!progressSaveTimer) progressSaveTimer = setInterval(() => void doSaveProgress(), 5000)
  }

  function onPause() {
    isPlaying = false
    videoLoading = false
    void doSaveProgress()
    clearPlaybackTimers()
  }

  function onPlaying() {
    videoLoading = false
  }

  function onEnded() {
    isPlaying = false
    void doSaveProgress()
    void doMark()
    void saveNextEpisodeResume()
    clearPlaybackTimers()
    if (isFullscreen && nextEpisode) startAutoNextCountdown()
  }

  function updateBuffered(video: HTMLVideoElement) {
    if (video.buffered.length > 0) buffered = bufferedEndAt(video)
  }

  function onTimeUpdate(video: HTMLVideoElement) {
    if (!isSeeking) currentTime = video.currentTime
    updateBuffered(video)
    if (skipTimes.length > 0) autoSkipCurrentSegment(video)
  }

  function onDurationChange(video: HTMLVideoElement) {
    if (video.duration && Number.isFinite(video.duration)) duration = video.duration
    void fetchSkipTimesIfNeeded()
  }

  function onVolumeChange(video: HTMLVideoElement) {
    volume = video.volume
    isMuted = video.muted
  }

  function registerVideoEvents(video: HTMLVideoElement) {
    const handleTimeUpdate = () => onTimeUpdate(video)
    const handleDurationChange = () => onDurationChange(video)
    const handleProgress = () => updateBuffered(video)
    const handleVolumeChange = () => onVolumeChange(video)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('ended', onEnded)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('durationchange', handleDurationChange)
    video.addEventListener('progress', handleProgress)
    video.addEventListener('volumechange', handleVolumeChange)
    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('durationchange', handleDurationChange)
      video.removeEventListener('progress', handleProgress)
      video.removeEventListener('volumechange', handleVolumeChange)
    }
  }

  // gestures
  function clearPendingTap() {
    if (pendingSingleTap) clearTimeout(pendingSingleTap)
    pendingSingleTap = null
    pendingWasVisible = null
  }

  function resetFeedback() {
    if (seekIndicatorTimer) clearTimeout(seekIndicatorTimer)
    seekIndicatorTimer = null
    seekAccumulator = 0
    seekIndicator = null
  }

  function scheduleSingleToggle() {
    clearPendingTap()
    pendingWasVisible = showControls
    pendingSingleTap = setTimeout(() => {
      const wasVisible = pendingWasVisible
      pendingSingleTap = null
      pendingWasVisible = null
      if (wasVisible !== null && showControls !== wasVisible) return
      toggleControlsVisibility()
    }, 300)
  }

  function schedulePlayPause() {
    clearPendingTap()
    pendingSingleTap = setTimeout(() => {
      pendingSingleTap = null
      pendingWasVisible = null
      if (!controlsVisible) return
      togglePlay()
    }, 300)
  }

  function handleZoneTap(zone: TapZone, withinCenterHitbox = false) {
    const now = Date.now()
    const isDoubleTap = now - lastTap[zone] < 300
    lastTap[zone] = now
    if (zone === 'center') {
      if (isDoubleTap) {
        clearPendingTap()
        void toggleFullscreen()
        return
      }
      if (withinCenterHitbox && controlsVisible) schedulePlayPause()
      else scheduleSingleToggle()
      return
    }
    if (!isDoubleTap) return scheduleSingleToggle()
    clearPendingTap()
    const delta = zone === 'left' ? -10 : 10
    seekRelative(delta)
    showSeekFeedback(zone, Math.abs(delta))
  }

  function speedCanStart() {
    const video = videoRef
    return Boolean(video && !video.paused)
  }

  function speedStart() {
    clearPendingTap()
    longPressActive = true
    wasLongPress = true
    const video = videoRef
    if (!video) return
    setHlsMaxBufferLength(120)
    video.playbackRate = 3
    showControls = false
    showEpisodes = false
    clearIdleTimer()
    speedBoost = true
  }

  function speedStop() {
    longPressActive = false
    const video = videoRef
    if (video) video.playbackRate = 1
    setHlsMaxBufferLength(60)
    speedBoost = false
  }

  function speedCancelTimer() {
    if (longPressTimer) clearTimeout(longPressTimer)
    longPressTimer = null
  }

  function speedStartTimer() {
    speedCancelTimer()
    longPressTimer = setTimeout(speedStart, 400)
  }

  function speedActive() {
    return longPressActive
  }

  function speedClear() {
    longPressActive = false
    if (speedBoost) speedStop()
    else speedBoost = false
    wasLongPress = false
  }

  function cancelPreview() {
    if (previewSeekTimer) clearTimeout(previewSeekTimer)
    previewSeekTimer = null
  }

  function schedulePreview() {
    cancelPreview()
    previewSeekTimer = setTimeout(() => {
      previewSeekTimer = null
      if (!isSeeking) return
      const video = videoRef
      if (!video) return
      const target = currentTime
      if (!Number.isFinite(target)) return
      if (Math.abs(video.currentTime - target) < 0.25) return
      try {
        video.currentTime = target
      } catch (error) {
        console.warn('preview seek failed', error)
      }
    }, 350)
  }

  function clampSeekTime(time: number) {
    if (!Number.isFinite(time)) return null
    return Math.max(0, Math.min(time, duration || 0))
  }

  function onSeekStart() {
    cancelPreview()
    isSeeking = true
    showControls = true
    clearIdleTimer()
  }

  function onSeekPreview(time: number) {
    const clamped = clampSeekTime(time)
    if (clamped === null) return
    currentTime = clamped
    schedulePreview()
  }

  function onSeekCommit(time: number) {
    cancelPreview()
    const clamped = clampSeekTime(time)
    if (clamped === null) return
    seekTo(clamped)
    isSeeking = false
    resetIdle()
  }

  function handleVideoTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1) {
      touchTracking = false
      speedCancelTimer()
      return
    }
    const touch = event.touches[0]
    if (!touch) return
    const el = event.currentTarget as HTMLElement | null
    touchDownZone = el ? getZone(touch.clientX, el) : 'center'
    touchInCenterHitbox = el ? isInCenterHitbox(touch.clientX, touch.clientY, el) : false
    touchStartX = touch.clientX
    touchStartY = touch.clientY
    touchMoved = false
    touchTracking = true
    if (touchDownZone === 'right' && speedCanStart()) speedStartTimer()
  }

  function handleVideoTouchMove(event: TouchEvent) {
    if (!touchTracking || event.touches.length !== 1) return
    const touch = event.touches[0]
    if (!touch) return
    if (Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY) > 12) {
      speedCancelTimer()
      touchMoved = true
    }
  }

  function handleVideoTouchEnd(event: TouchEvent) {
    if (!touchTracking) return
    touchTracking = false
    if (speedActive()) {
      if (event.cancelable) event.preventDefault()
      speedCancelTimer()
      speedStop()
      setTimeout(() => {
        wasLongPress = false
      }, 50)
      return
    }
    speedCancelTimer()
    if (touchMoved) return
    if (event.cancelable) event.preventDefault()
    handleZoneTap(touchDownZone, touchInCenterHitbox)
  }

  function handleVideoTouchCancel() {
    touchTracking = false
    speedCancelTimer()
    if (speedActive()) speedStop()
  }

  function handleVideoPointerDown(event: PointerEvent) {
    if (event.pointerType === 'touch' || event.button !== 0) return
    const el = event.currentTarget as HTMLElement | null
    mouseDownZone = el ? getZone(event.clientX, el) : 'center'
    mouseDownInCenterHitbox = el ? isInCenterHitbox(event.clientX, event.clientY, el) : false
    mouseDownX = event.clientX
    mouseDownY = event.clientY
    mouseDown = true
    mousePointerId = event.pointerId
    if (el) {
      try {
        el.setPointerCapture(event.pointerId)
      } catch (error) {
        console.warn('setPointerCapture failed', error)
      }
    }
    if (mouseDownZone === 'right' && speedCanStart()) speedStartTimer()
  }

  function handleVideoPointerMove(event: PointerEvent) {
    if (event.pointerType === 'touch' || !mouseDown) return
    if (mousePointerId !== null && event.pointerId !== mousePointerId) return
    if (Math.hypot(event.clientX - mouseDownX, event.clientY - mouseDownY) > 8) speedCancelTimer()
  }

  function handleVideoPointerUp(event: PointerEvent) {
    if (event.pointerType === 'touch' || !mouseDown) return
    if (mousePointerId !== null && event.pointerId !== mousePointerId) return
    mouseDown = false
    mousePointerId = null
    if (speedActive()) {
      speedCancelTimer()
      speedStop()
      setTimeout(() => {
        wasLongPress = false
      }, 50)
      return
    }
    speedCancelTimer()
    if (Math.hypot(event.clientX - mouseDownX, event.clientY - mouseDownY) > 10) return
    event.preventDefault()
    handleZoneTap(mouseDownZone, mouseDownInCenterHitbox)
  }

  function handleVideoPointerCancel(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    mouseDown = false
    mousePointerId = null
    speedCancelTimer()
    if (speedActive()) speedStop()
  }

  function clearGestureState() {
    speedCancelTimer()
    cancelPreview()
    resetFeedback()
    clearPendingTap()
    touchTracking = false
    touchMoved = false
    mouseDown = false
    mousePointerId = null
    speedClear()
    isSeeking = false
    wasLongPress = false
  }

  // episode lifecycle
  async function resetForEpisode() {
    const epoch = ++resetEpoch
    clearAnyTimer(countdownTimer)
    resetPlaybackTracking()
    countdownTimer = null
    lastSavedTime = 0
    resumeTime = 0
    autoNextCountdown = null
    currentTime = 0
    duration = 0
    buffered = 0
    isPlaying = autoPlayOnLoad
    isSeeking = false
    seekIndicator = null
    resolving = true
    loadingMessage = 'Menyiapkan player...'
    pendingStartHide = true
    resetSkip()
    clearGestureState()
    resetQuality()

    const pendingReset = (async () => {
      try {
        const resume = await savedResumeTime()
        if (epoch !== resetEpoch) return
        resumeTime = resume
        watchedMarked = (await getEpisodeStatus(progressStoreKey)) === 'completed'
      } catch {}
    })()
    resetSettled = pendingReset
    await pendingReset
    if (resetSettled === pendingReset) resetSettled = null
  }

  async function saveNextEpisodeResume() {
    const next = nextEpisode
    if (!next) return
    await saveProgress(progressKey(getProps().malId, next.num), {
      currentTime: 0,
      duration: 1,
      malId: getProps().malId,
      episodeNumber: next.num,
      latestEpisode: latestAvailableEpisode(),
    })
  }

  function loadEpisodeSource() {
    if (typeof window === 'undefined') return
    const stream = episode.stream
    const def =
      (stream && { server: stream.server, quality: stream.quality }) ??
      qualityLevels[0] ??
      findDefaultMirror(episode)
    if (!def) {
      resolving = false
      return
    }
    const gate = resetSettled
    if (!gate) {
      void playWithFallback(def, false)
      return
    }
    void gate
      .catch(() => {})
      .then(() => {
        void playWithFallback(def, false)
      })
  }

  async function loadEpisodeInPlace(epNum: number, shouldAutoPlay = false) {
    invalidatePlaybackSession()
    resetEpoch++
    resetQuality()
    resolving = true
    loadingMessage = 'Menyiapkan episode...'
    directUrl = null
    directKind = null
    autoPlayOnLoad = shouldAutoPlay
    resumeTime = 0
    detachVideoSource()
    const video = videoRef
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    let data: EpisodePageData | null = null
    try {
      data = await loadEpisode({ malId: getProps().malId, episodeNumber: epNum })
    } catch {
      resolving = false
      return
    }
    if (!data) {
      resolving = false
      return
    }
    episode.title = data.episode.title
    episode.thumbnail = data.episode.thumbnail
    episode.sources = data.episode.sources
    episode.stream = data.episode.stream
    currentEpisodeNum = data.episodeNumber
    window.history.replaceState(null, '', `/anime/${getProps().malId}/${data.episodeNumber}`)
    document.title = `${data.episode.title} - Nimeplay`
  }

  function navigateEpisode(epNum: number) {
    if (isFullscreen) void loadEpisodeInPlace(epNum, !!videoRef && !videoRef.paused)
    else onNavigate(`/anime/${getProps().malId}/${epNum}`)
  }

  function cancelAutoNext() {
    if (countdownTimer) clearInterval(countdownTimer)
    countdownTimer = null
    autoNextCountdown = null
  }

  function goNextNow() {
    cancelAutoNext()
    if (!nextEpisode) return
    if (isFullscreen) void loadEpisodeInPlace(nextEpisode.num, true)
    else onNavigate(`/anime/${getProps().malId}/${nextEpisode.num}`)
  }

  function startAutoNextCountdown() {
    autoNextCountdown = 5
    countdownTimer = setInterval(() => {
      if (autoNextCountdown === null) return
      if (!isFullscreen) return cancelAutoNext()
      if (autoNextCountdown <= 1) goNextNow()
      else autoNextCountdown -= 1
    }, 1000)
  }

  function showPausedControls() {
    showControls = true
    clearIdleTimer()
  }

  function onPlaybackStarted() {
    videoLoading = false
    if (pendingStartHide) {
      pendingStartHide = false
      resetIdle(START_CONTROLS_IDLE_MS)
    } else resetIdle()
  }

  function updatePlayingState(playing: boolean) {
    if (playing) onPlaybackStarted()
    else showPausedControls()
    setMediaPlaybackState(playing)
  }

  function toggleAutoSkip() {
    autoSkip = !autoSkip
    void setAutoSkip(autoSkip)
  }

  function onFullscreenChange() {
    isFullscreen = !!document.fullscreenElement
    if (isFullscreen) resetIdle()
    if (!isFullscreen) {
      cancelAutoNext()
      void lockPlayerOrientation('portrait')
    }
  }

  function onKey(event: KeyboardEvent) {
    if (!showNative) return
    const target = event.target instanceof HTMLElement ? event.target : null
    if (isInteractiveTarget(target)) return
    handleKeyboardShortcut(event)
  }

  function onPointerActivity() {
    resetIdle()
  }

  function onLeave() {
    if (isSeeking) return
    if (videoRef && !videoRef.paused) {
      showControls = false
      showEpisodes = false
    }
  }

  function mount() {
    void getAutoSkip().then(val => {
      autoSkip = val
    })
    startQuality()
    const video = videoRef
    if (video) registerVideoEvents(video)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    window.addEventListener('keydown', onKey)
    containerRef?.addEventListener('mousemove', onPointerActivity)
    containerRef?.addEventListener('mouseleave', onLeave)
    installMediaHandlers()
    updateMediaMetadata()
    void resetForEpisode().then(() => loadEpisodeSource())
  }

  function unmount() {
    void doSaveProgress()
    const current = videoRef
    if (current) {
      try {
        current.pause()
      } catch {}
      current.removeAttribute('src')
      try {
        current.load()
      } catch {}
    }
    detachVideoSource()
    stopQuality()
    invalidatePlaybackSession()
    clearAnyTimer(countdownTimer)
    clearAnyTimer(idleTimer)
    if (volumeTimer) clearTimeout(volumeTimer)
    if (volumeIndicatorTimer) clearTimeout(volumeIndicatorTimer)
    clearAnyTimer(seekIndicatorTimer)
    clearPlaybackTimers()
    clearGestureState()
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    window.removeEventListener('keydown', onKey)
    containerRef?.removeEventListener('mousemove', onPointerActivity)
    containerRef?.removeEventListener('mouseleave', onLeave)
    if (isFullscreen || document.fullscreenElement) void exitPlayerFullscreen()
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
  }

  $effect(() => {
    void directUrl
    void directKind
    void videoRef
    void applyVideoSource()
  })

  $effect(() => {
    updatePlayingState(isPlaying)
  })

  return {
    get episode() {
      return episode
    },
    get currentEpisodeNum() {
      return currentEpisodeNum
    },
    get autoNextCountdown() {
      return autoNextCountdown
    },
    get autoSkip() {
      return autoSkip
    },
    get bufferedPct() {
      return bufferedPct
    },
    get controlsVisible() {
      return controlsVisible
    },
    get currentTime() {
      return currentTime
    },
    get duration() {
      return duration
    },
    get isFullscreen() {
      return isFullscreen
    },
    get isMuted() {
      return isMuted
    },
    get isPlaying() {
      return isPlaying
    },
    get isSeeking() {
      return isSeeking
    },
    get loadingMessage() {
      return loadingMessage
    },
    get nextEpisode() {
      return nextEpisode
    },
    get prevEpisode() {
      return prevEpisode
    },
    get progress() {
      return progress
    },
    get resolving() {
      return resolving
    },
    get seekIndicator() {
      return seekIndicator
    },
    get seekIndicatorKey() {
      return seekIndicatorKey
    },
    get showControls() {
      return showControls
    },
    get showEmpty() {
      return showEmpty
    },
    get showEpisodes() {
      return showEpisodes
    },
    get showLoading() {
      return showLoading
    },
    get showNative() {
      return showNative
    },
    get showVolume() {
      return showVolume
    },
    get skipTimes() {
      return skipTimes
    },
    get speedBoost() {
      return speedBoost
    },
    get volume() {
      return volume
    },
    get volumeIndicator() {
      return volumeIndicator
    },
    get wasLongPress() {
      return wasLongPress
    },
    setContainer,
    setVideo,
    changeVolume,
    cancelAutoNext,
    goNextNow,
    handleKeyboardShortcut,
    handleVideoPointerCancel,
    handleVideoPointerDown,
    handleVideoPointerMove,
    handleVideoPointerUp,
    handleVideoTouchCancel,
    handleVideoTouchEnd,
    handleVideoTouchMove,
    handleVideoTouchStart,
    hideVolumeControl,
    navigateEpisode,
    onSeekCommit,
    onSeekPreview,
    onSeekStart,
    showVolumeControl,
    toggleAutoSkip,
    toggleEpisodesPanel,
    toggleFullscreen,
    toggleMute,
    togglePlay,
    mount,
    unmount,
  }
}

export type EpisodePlayer = ReturnType<typeof createEpisodePlayer>

import type { ComputedRef, Ref } from 'vue'
import type { SkipTime } from '~/utils/types'

type EpisodeLink = { slug: string; num: string }

interface EpisodePlayerMediaEventOptions {
  isPlaying: Ref<boolean>
  isSeeking: Ref<boolean>
  currentTime: Ref<number>
  duration: Ref<number>
  buffered: Ref<number>
  volume: Ref<number>
  isMuted: Ref<boolean>
  isFullscreen: Ref<boolean>
  nextEpisode: ComputedRef<EpisodeLink | null>
  skipTimes: Ref<SkipTime[]>
  autoSkipCurrentSegment: (video: HTMLVideoElement) => void
  canMarkWatched: () => boolean
  doMark: () => void
  doSaveProgress: () => void
  fetchSkipTimesIfNeeded: () => Promise<void>
  saveNextEpisodeResume: () => void
  startAutoNextCountdown: () => void
}

function clearTimer(timer: ReturnType<typeof setInterval> | null) {
  if (timer) clearInterval(timer)
}

export function useEpisodePlayerMediaEvents(options: EpisodePlayerMediaEventOptions) {
  let playSeconds = 0
  let playTimer: ReturnType<typeof setInterval> | null = null
  let progressSaveTimer: ReturnType<typeof setInterval> | null = null

  function clearWatchedTimer() {
    clearTimer(playTimer)
    playTimer = null
  }

  function clearPlaybackTimers() {
    clearWatchedTimer()
    clearTimer(progressSaveTimer)
    progressSaveTimer = null
  }

  function resetPlaybackTracking() {
    clearPlaybackTimers()
    playSeconds = 0
  }

  function startWatchedTimer() {
    if (!options.canMarkWatched() || playTimer) return
    playTimer = setInterval(() => {
      playSeconds += 1
      if (playSeconds >= 10) options.doMark()
    }, 1000)
  }

  function onPlay() {
    options.isPlaying.value = true
    startWatchedTimer()
    if (!progressSaveTimer) progressSaveTimer = setInterval(options.doSaveProgress, 5000)
  }

  function onPause() {
    options.isPlaying.value = false
    options.doSaveProgress()
    clearPlaybackTimers()
  }

  function onEnded() {
    options.isPlaying.value = false
    options.doSaveProgress()
    options.doMark()
    options.saveNextEpisodeResume()
    clearPlaybackTimers()
    if (options.isFullscreen.value && options.nextEpisode.value) options.startAutoNextCountdown()
  }

  function onTimeUpdate(video: HTMLVideoElement) {
    if (!options.isSeeking.value) options.currentTime.value = video.currentTime
    if (options.skipTimes.value.length > 0) options.autoSkipCurrentSegment(video)
  }

  function onDurationChange(video: HTMLVideoElement) {
    if (video.duration && Number.isFinite(video.duration)) options.duration.value = video.duration
    void options.fetchSkipTimesIfNeeded()
  }

  function onProgress(video: HTMLVideoElement) {
    if (video.buffered.length > 0) options.buffered.value = video.buffered.end(video.buffered.length - 1)
  }

  function onVolumeChange(video: HTMLVideoElement) {
    options.volume.value = video.volume
    options.isMuted.value = video.muted
  }

  function registerVideoEvents(video: HTMLVideoElement) {
    const handleTimeUpdate = () => onTimeUpdate(video)
    const handleDurationChange = () => onDurationChange(video)
    const handleProgress = () => onProgress(video)
    const handleVolumeChange = () => onVolumeChange(video)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('durationchange', handleDurationChange)
    video.addEventListener('progress', handleProgress)
    video.addEventListener('volumechange', handleVolumeChange)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('durationchange', handleDurationChange)
      video.removeEventListener('progress', handleProgress)
      video.removeEventListener('volumechange', handleVolumeChange)
    }
  }

  return {
    clearPlaybackTimers,
    clearWatchedTimer,
    registerVideoEvents,
    resetPlaybackTracking,
  }
}

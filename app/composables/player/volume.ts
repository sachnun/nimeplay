import type { Ref } from 'vue'

interface EpisodePlayerVolumeOptions {
  videoRef: Ref<HTMLVideoElement | null>
  volume: Ref<number>
  isMuted: Ref<boolean>
  showVolume: Ref<boolean>
  volumeIndicator: Ref<{ volume: number; isMuted: boolean } | null>
}

export function useEpisodePlayerVolume(options: EpisodePlayerVolumeOptions) {
  const { videoRef, volume, isMuted, showVolume, volumeIndicator } = options
  let volumeTimer: ReturnType<typeof setTimeout> | null = null
  let indicatorTimer: ReturnType<typeof setTimeout> | null = null

  function showVolumeControl() {
    if (volumeTimer) clearTimeout(volumeTimer)
    showVolume.value = true
  }

  function hideVolumeControl() {
    volumeTimer = setTimeout(() => { showVolume.value = false }, 300)
  }

  function showVolumeIndicator() {
    const video = videoRef.value
    if (!video) return
    if (indicatorTimer) clearTimeout(indicatorTimer)
    volumeIndicator.value = { volume: video.volume, isMuted: video.muted }
    indicatorTimer = setTimeout(() => { volumeIndicator.value = null }, 1000)
  }

  function toggleMute() {
    if (videoRef.value) videoRef.value.muted = !videoRef.value.muted
    showVolumeIndicator()
  }

  function changeVolume(v: number) {
    const clamped = Math.max(0, Math.min(1, v))
    volume.value = clamped
    if (clamped > 0) isMuted.value = false
    const video = videoRef.value
    if (!video) return
    video.volume = clamped
    if (video.muted && clamped > 0) video.muted = false
    showVolumeIndicator()
  }

  function resetVolumeTimers() {
    if (volumeTimer) clearTimeout(volumeTimer)
    if (indicatorTimer) clearTimeout(indicatorTimer)
    volumeTimer = null
    indicatorTimer = null
  }

  return { showVolumeControl, hideVolumeControl, toggleMute, changeVolume, resetVolumeTimers }
}

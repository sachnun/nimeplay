import type { Ref } from 'vue'
import { loadHls } from '~/utils/hls'

interface EpisodePlayerSourceOptions {
  videoRef: Ref<HTMLVideoElement | null>
  directUrl: Ref<string | null>
  directKind: Ref<'hls' | 'file' | null>
  videoLoading: Ref<boolean>
  loadingMessage: Ref<string>
  triggerFallback: () => void
}

export function useEpisodePlayerSource(options: EpisodePlayerSourceOptions) {
  const { videoRef, directUrl, directKind, videoLoading, loadingMessage, triggerFallback } = options
  let hls: any | null = null
  let resumeTime = 0
  let autoPlayOnLoad = true

  function destroyHls() {
    if (hls) {
      hls.destroy()
      hls = null
    }
  }

  function setHlsMaxBufferLength(length: number) {
    if (hls) hls.config.maxBufferLength = length
  }

  function attachNativeSource(video: HTMLVideoElement, url: string, onVideoError: () => void) {
    video.src = url
    video.addEventListener('error', onVideoError, { once: true })
  }

  async function attachHlsSource(video: HTMLVideoElement, url: string, onVideoError: () => void) {
    const Hls = (await loadHls()).default
    if (Hls.isSupported()) {
      hls = new Hls({
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
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

  async function attachVideoSource(video: HTMLVideoElement, url: string, kind: 'hls' | 'file' | null, onVideoError: () => void) {
    if (kind === 'hls') return attachHlsSource(video, url, onVideoError)
    attachNativeSource(video, url, onVideoError)
  }

  watch([directUrl, videoRef], async ([url, video], _, onCleanup) => {
    if (!video) return
    if (!url) {
      destroyHls()
      try {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
      catch {}
      return
    }
    loadingMessage.value = 'Memuat video...'
    videoLoading.value = true
    destroyHls()
    let stallTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      stallTimer = null
      const el = videoRef.value
      if (!el || !videoLoading.value) return
      if (el.readyState >= 2 || !el.paused) videoLoading.value = false
      else triggerFallback()
    }, 15000)
    const clearStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = null
    }
    const onFirstFrame = () => {
      videoLoading.value = false
      clearStallTimer()
    }
    const onVideoError = () => triggerFallback()
    video.addEventListener('canplay', onFirstFrame, { once: true })
    video.addEventListener('loadeddata', onFirstFrame, { once: true })
    video.addEventListener('playing', onFirstFrame, { once: true })

    await attachVideoSource(video as HTMLVideoElement, url as string, directKind.value, onVideoError)

    const current = video as HTMLVideoElement
    if (current.readyState >= 2 || !current.paused) videoLoading.value = false
    if (!videoLoading.value) clearStallTimer()
    const onReady = () => resumeAndAutoplay(current)
    current.addEventListener('canplay', onReady)
    onCleanup(() => {
      current.removeEventListener('canplay', onFirstFrame)
      current.removeEventListener('loadeddata', onFirstFrame)
      current.removeEventListener('playing', onFirstFrame)
      current.removeEventListener('canplay', onReady)
      current.removeEventListener('error', onVideoError)
      clearStallTimer()
      destroyHls()
    })
  })

  return {
    destroyHls,
    setHlsMaxBufferLength,
    bandwidthEstimate: () => hls?.bandwidthEstimate ?? NaN,
    setAutoPlay: (value: boolean) => { autoPlayOnLoad = value },
    autoPlayWanted: () => autoPlayOnLoad,
    setResume: (time: number) => { resumeTime = time },
    clearResume: () => { resumeTime = 0 },
  }
}

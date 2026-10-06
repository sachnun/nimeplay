import type { ComputedRef, Ref } from 'vue'

interface EpisodeLink {
  num: number
}

interface EpisodePlayerMediaSessionOptions {
  getTitle: () => string
  getEpisodeNumber: () => number
  getAlbum: () => string
  getArtwork: () => string
}

interface EpisodePlayerMediaHandlers {
  videoRef: Ref<HTMLVideoElement | null>
  seekRelative: (delta: number) => void
  prevEpisode: ComputedRef<EpisodeLink | null>
  nextEpisode: ComputedRef<EpisodeLink | null>
  navigateEpisode: (num: number) => void
}

function setMediaPlaybackState(playing: boolean) {
  if (import.meta.client && 'mediaSession' in navigator)
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
}

function setHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
  try {
    navigator.mediaSession.setActionHandler(action, handler)
  } catch (error) {
    console.warn('mediaSession.setActionHandler failed', error)
  }
}

function installHandlers(handlers: EpisodePlayerMediaHandlers) {
  if (!('mediaSession' in navigator)) return
  setHandler('play', () => {
    if (handlers.videoRef.value) void handlers.videoRef.value.play()
  })
  setHandler('pause', () => handlers.videoRef.value?.pause())
  setHandler('seekbackward', details => handlers.seekRelative(-(details.seekOffset ?? 10)))
  setHandler('seekforward', details => handlers.seekRelative(details.seekOffset ?? 10))
  setHandler('previoustrack', () => {
    if (handlers.prevEpisode.value) handlers.navigateEpisode(handlers.prevEpisode.value.num)
  })
  setHandler('nexttrack', () => {
    if (handlers.nextEpisode.value) handlers.navigateEpisode(handlers.nextEpisode.value.num)
  })
}

export function useEpisodePlayerMediaSession(options: EpisodePlayerMediaSessionOptions) {
  function artwork() {
    const url = options.getArtwork()
    if (!url) return []
    let src = url
    try {
      src = new URL(url, window.location.href).href
    } catch {}
    return [96, 192, 256, 384, 512].map(size => ({ src, sizes: `${size}x${size}`, type: 'image/jpeg' }))
  }

  function updateMediaMetadata() {
    if (!import.meta.client || !('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: options.getTitle(),
      artist: `Episode ${options.getEpisodeNumber()}`,
      album: options.getAlbum(),
      artwork: artwork(),
    })
  }

  return { setMediaPlaybackState, updateMediaMetadata, installHandlers }
}

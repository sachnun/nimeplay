import type { Ref } from 'vue'

interface EpisodePlayerFullscreenOptions {
  containerRef: Ref<HTMLElement | null>
  isFullscreen: Ref<boolean>
  resetIdle: () => void
  cancelAutoNext: () => void
}

export function useEpisodePlayerFullscreen(options: EpisodePlayerFullscreenOptions) {
  const { containerRef, isFullscreen, resetIdle, cancelAutoNext } = options

  async function lockPlayerOrientation(orientation: 'landscape' | 'portrait') {
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

    try { await el.requestFullscreen() } catch (error) { console.warn('requestFullscreen failed', error) }
    await lockPlayerOrientation('landscape')

    if (document.fullscreenElement || isFullscreen.value) {
      isFullscreen.value = true
      resetIdle()
    }
  }

  return { exitPlayerFullscreen, toggleFullscreen, lockPlayerOrientation }
}

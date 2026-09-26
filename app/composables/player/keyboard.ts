import type { Ref } from 'vue'

const INTERACTIVE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

interface EpisodePlayerKeyboardOptions {
  videoRef: Ref<HTMLVideoElement | null>
  togglePlay: () => void
  seekRelative: (delta: number) => void
  showSeekFeedback: (side: 'left' | 'right', seconds: number) => void
  changeVolume: (v: number) => void
  toggleMute: () => void
  toggleFullscreen: () => void | Promise<void>
}

export function useEpisodePlayerKeyboard(options: EpisodePlayerKeyboardOptions) {
  const { videoRef, togglePlay, seekRelative, showSeekFeedback, changeVolume, toggleMute, toggleFullscreen } = options

  function isInteractiveTarget(target: HTMLElement | null) {
    return Boolean(target && (INTERACTIVE_TAGS.has(target.tagName) || target.closest('a, button, [role="button"], [role="slider"]')))
  }

  function keyboardShortcutKey(event: KeyboardEvent) {
    return event.key.length === 1 ? event.key.toLowerCase() : event.key
  }

  function handleKeyboardShortcut(event: KeyboardEvent) {
    const volume = videoRef.value?.volume ?? 1
    const shortcuts: Record<string, () => void> = {
      ' ': togglePlay,
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

  return { isInteractiveTarget, handleKeyboardShortcut }
}

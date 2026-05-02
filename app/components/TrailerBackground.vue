<script setup lang="ts">
const props = defineProps<{ trailerEmbedUrl?: string | null }>()

interface YTPlayer {
  destroy(): void
  getDuration(): number
  getCurrentTime(): number
  seekTo(seconds: number, allowSeekAhead?: boolean): void
  setPlaybackQuality(quality: string): void
}

interface YTWindow extends Window {
  YT?: { PlayerState: { PLAYING: number }; Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer }
  onYouTubeIframeAPIReady?: () => void
}

const PLAYER_VARS = {
  autoplay: 1,
  mute: 1,
  controls: 0,
  showinfo: 0,
  rel: 0,
  modestbranding: 1,
  playsinline: 1,
  disablekb: 1,
  fs: 0,
  iv_load_policy: 3,
}

const ready = ref(false)
const ended = ref(false)
const enabled = ref(false)
const containerRef = ref<HTMLDivElement | null>(null)
let player: YTPlayer | null = null
let poll: ReturnType<typeof setInterval> | null = null
let enableTimer: ReturnType<typeof setTimeout> | null = null

function extractTrailerVideoId(embedUrl?: string | null) {
  return embedUrl?.match(/\/embed\/([^?/]+)/)?.[1] ?? null
}

const videoId = computed(() => enabled.value ? extractTrailerVideoId(props.trailerEmbedUrl) : null)

function clearPlayer() {
  if (poll) clearInterval(poll)
  poll = null
  player?.destroy()
  player = null
  ready.value = false
  ended.value = false
}

function clearPoll() {
  if (poll) clearInterval(poll)
  poll = null
}

function seekIntoTrailer() {
  const activePlayer = player
  if (!activePlayer) return
  activePlayer.setPlaybackQuality(window.innerWidth < 768 ? 'small' : 'medium')
  const duration = activePlayer.getDuration()
  if (duration > 0) activePlayer.seekTo(duration * 0.2, true)
}

function pollTrailerEnd() {
  if (!player) return
  const duration = player.getDuration()
  const current = player.getCurrentTime()
  if (duration <= 0 || current < duration * 0.85) return
  ended.value = true
  clearPoll()
}

function startEndPolling() {
  if (!poll) poll = setInterval(pollTrailerEnd, 500)
}

function markTrailerPlaying() {
  ready.value = true
  startEndPolling()
}

function handlePlayerStateChange(data: number, w: YTWindow, cancelled: () => boolean) {
  if (cancelled()) return
  if (data === w.YT?.PlayerState.PLAYING) markTrailerPlaying()
  if (data === 0) ended.value = true
}

function loadYoutubeApi(w: YTWindow, createPlayer: () => void) {
  const prev = w.onYouTubeIframeAPIReady
  w.onYouTubeIframeAPIReady = () => {
    prev?.()
    createPlayer()
  }
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  }
}

function createYoutubePlayer(id: string, w: YTWindow, cancelled: () => boolean) {
  const target = containerRef.value
  const Player = w.YT?.Player
  if (cancelled() || !target || !Player) return
  player = new Player(target, {
    videoId: id,
    playerVars: PLAYER_VARS,
    events: {
      onReady: seekIntoTrailer,
      onStateChange: (e: { data: number }) => handlePlayerStateChange(e.data, w, cancelled),
    },
  })
}

onMounted(() => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const isSmallScreen = window.matchMedia('(max-width: 767px)').matches
  if (!prefersReducedMotion && !isSmallScreen) {
    enableTimer = setTimeout(() => { enabled.value = true }, 1200)
  }

  watch(videoId, (id, _, onCleanup) => {
    clearPlayer()
    if (!id || !containerRef.value) return
    let cancelled = false
    const w = window as YTWindow
    const createPlayer = () => createYoutubePlayer(id, w, () => cancelled)

    loadOrCreatePlayer(w, createPlayer)

    onCleanup(() => {
      cancelled = true
      clearPlayer()
    })
  }, { immediate: true })
})

function loadOrCreatePlayer(w: YTWindow, createPlayer: () => void) {
  if (w.YT?.Player) createPlayer()
  else loadYoutubeApi(w, createPlayer)
}

onBeforeUnmount(clearPlayer)
onBeforeUnmount(() => {
  if (enableTimer) clearTimeout(enableTimer)
})
</script>

<template>
  <div
    v-if="videoId"
    class="absolute inset-0 z-0 overflow-hidden transition-opacity ease-in"
    :class="ended ? 'duration-[6000ms] opacity-0' : ready ? 'duration-[5000ms] opacity-50' : 'duration-[5000ms] opacity-0'"
  >
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full aspect-video blur-[3px] scale-105 lg:blur-[2px] lg:scale-[1.02] [&>iframe]:w-full [&>iframe]:h-full">
      <div ref="containerRef" class="pointer-events-none w-full h-full" />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ trailerEmbedUrl?: string | null }>()

interface YTPlayer {
  destroy(): void
  getDuration(): number
  getCurrentTime(): number
  seekTo(seconds: number, allowSeekAhead?: boolean): void
  setPlaybackQuality(quality: string): void
}

const ready = ref(false)
const ended = ref(false)
const containerRef = ref<HTMLDivElement | null>(null)
let player: YTPlayer | null = null
let poll: ReturnType<typeof setInterval> | null = null

const videoId = computed(() => props.trailerEmbedUrl?.match(/\/embed\/([^?/]+)/)?.[1] ?? null)

function clearPlayer() {
  if (poll) clearInterval(poll)
  poll = null
  player?.destroy()
  player = null
  ready.value = false
  ended.value = false
}

onMounted(() => {
  watch(videoId, (id, _, onCleanup) => {
    clearPlayer()
    if (!id || !containerRef.value) return
    let cancelled = false
    const w = window as typeof window & {
      YT?: { PlayerState: { PLAYING: number }; Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer }
      onYouTubeIframeAPIReady?: () => void
    }

    const createPlayer = () => {
      if (cancelled || !containerRef.value || !w.YT?.Player) return
      player = new w.YT.Player(containerRef.value, {
        videoId: id,
        playerVars: {
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
        },
        events: {
          onReady: () => {
            if (!player) return
            player.setPlaybackQuality(window.innerWidth < 768 ? 'small' : 'medium')
            const dur = player.getDuration()
            if (dur > 0) player.seekTo(dur * 0.2, true)
          },
          onStateChange: (e: { data: number }) => {
            if (!w.YT || cancelled) return
            if (e.data === w.YT.PlayerState.PLAYING) {
              ready.value = true
              if (!poll) {
                poll = setInterval(() => {
                  if (!player) return
                  const dur = player.getDuration()
                  const cur = player.getCurrentTime()
                  if (dur > 0 && cur >= dur * 0.85) {
                    ended.value = true
                    if (poll) clearInterval(poll)
                    poll = null
                  }
                }, 500)
              }
            }
            if (e.data === 0) ended.value = true
          },
        },
      })
    }

    if (w.YT?.Player) createPlayer()
    else {
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

    onCleanup(() => {
      cancelled = true
      clearPlayer()
    })
  }, { immediate: true })
})

onBeforeUnmount(clearPlayer)
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

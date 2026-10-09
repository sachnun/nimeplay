import type { ComputedRef, Ref } from 'vue'

interface EpisodePlayerQualityOptions {
  videoRef: Ref<HTMLVideoElement | null>
  levels: ComputedRef<MirrorCandidate[]>
  activeQuality: Ref<string>
  isSwitching: () => boolean
  bufferAhead: () => number
  bandwidthEstimate?: () => number
  onSelect: (candidate: MirrorCandidate) => void
}

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

function networkBandwidth(): number | null {
  if (!import.meta.client) return null
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

export function pickInitialQuality(levels: MirrorCandidate[]): MirrorCandidate | null {
  return levels[0] ?? null
}

function addBufferingListeners(video: HTMLVideoElement, onStart: () => void, onEnd: () => void) {
  video.addEventListener('waiting', onStart)
  video.addEventListener('stalled', onStart)
  video.addEventListener('playing', onEnd)
  video.addEventListener('canplay', onEnd)
  return () => {
    video.removeEventListener('waiting', onStart)
    video.removeEventListener('stalled', onStart)
    video.removeEventListener('playing', onEnd)
    video.removeEventListener('canplay', onEnd)
  }
}

export function useEpisodePlayerQuality(options: EpisodePlayerQualityOptions) {
  let timer: ReturnType<typeof setInterval> | null = null
  let lastDowngradeAt = 0
  let lastUpgradeAt = 0
  let bufferingSince: number | null = null
  let stalled = false
  let smoothSince = Date.now()
  let attached: HTMLVideoElement | null = null
  let detach: (() => void) | null = null

  function currentBandwidth(): number | null {
    const external = options.bandwidthEstimate?.()
    if (external && Number.isFinite(external) && external > 0) return external
    return networkBandwidth()
  }

  function onBufferingStart() {
    if (bufferingSince === null) bufferingSince = Date.now()
    smoothSince = 0
  }

  function onBufferingEnd() {
    if (bufferingSince !== null && Date.now() - bufferingSince >= STALL_THRESHOLD_MS) stalled = true
    bufferingSince = null
    smoothSince = Date.now()
  }

  function detachVideo() {
    detach?.()
    detach = null
    attached = null
    bufferingSince = null
    stalled = false
  }

  function attachVideo(video: HTMLVideoElement | null) {
    if (attached === video) return
    detachVideo()
    attached = video
    smoothSince = Date.now()
    if (!video) return
    detach = addBufferingListeners(video, onBufferingStart, onBufferingEnd)
  }

  watch(options.videoRef, video => attachVideo(video), { immediate: true })

  function commit(level: MirrorCandidate, now: number) {
    lastDowngradeAt = now
    lastUpgradeAt = now
    bufferingSince = null
    stalled = false
    smoothSince = now
    options.onSelect(level)
  }

  function isStalling(now: number) {
    return stalled || (bufferingSince !== null && now - bufferingSince >= STALL_THRESHOLD_MS)
  }

  function downgrade(levels: MirrorCandidate[], index: number, now: number) {
    stalled = false
    if (lastDowngradeAt && now - lastDowngradeAt < DOWNGRADE_COOLDOWN_MS) return
    const lower = levels[index + 1]
    if (lower) commit(lower, now)
  }

  function upgrade(levels: MirrorCandidate[], index: number, now: number) {
    if (lastUpgradeAt && now - lastUpgradeAt < UPGRADE_COOLDOWN_MS) return
    if (!smoothSince || now - smoothSince < SMOOTH_UPGRADE_MS) return
    if (options.bufferAhead() < BUFFER_HEALTHY) return
    const higher = levels[index - 1]
    if (!higher) return
    const bandwidth = currentBandwidth()
    if (bandwidth !== null && qualityBitrate(higher.quality) > bandwidth * SAFETY_MARGIN) return
    commit(higher, now)
  }

  function evaluate() {
    const video = options.videoRef.value
    if (!video || video.paused || video.seeking || !Number.isFinite(video.duration)) return
    if (options.isSwitching()) return
    const levels = options.levels.value
    if (levels.length < 2) return
    const index = levels.findIndex(level => level.quality === options.activeQuality.value)
    if (index === -1) return
    const now = Date.now()
    if (isStalling(now)) return downgrade(levels, index, now)
    upgrade(levels, index, now)
  }

  function start() {
    attachVideo(options.videoRef.value)
    if (timer) return
    smoothSince = Date.now()
    timer = setInterval(evaluate, CHECK_INTERVAL_MS)
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
    detachVideo()
  }

  function reset() {
    lastDowngradeAt = 0
    lastUpgradeAt = 0
    bufferingSince = null
    stalled = false
    smoothSince = Date.now()
  }

  return { reset, start, stop }
}

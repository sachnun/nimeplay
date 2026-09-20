import type { ComputedRef, Ref } from 'vue'
import { qualityBitrate, type MirrorCandidate } from '~/utils/player'

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
const CHECK_INTERVAL_MS = 5_000
const MIN_SWITCH_INTERVAL_MS = 60_000
const BUFFER_CRITICAL = 4
const BUFFER_RECOVER = 12
const DOWNGRADE_SAMPLES = 6
const UPGRADE_SAMPLES = 1

function networkBandwidth(): number | null {
  if (!import.meta.client) return null
  const connection = (navigator as Navigator & {
    connection?: { downlink?: number; effectiveType?: string; saveData?: boolean }
  }).connection
  if (!connection) return null
  if (connection.saveData) return 0
  if (typeof connection.downlink === 'number' && connection.downlink > 0) return connection.downlink * 1_000_000
  return connection.effectiveType ? NETWORK_RATES[connection.effectiveType] ?? null : null
}

export function pickInitialQuality(levels: MirrorCandidate[]): MirrorCandidate | null {
  return levels[0] ?? null
}

export function useEpisodePlayerQuality(options: EpisodePlayerQualityOptions) {
  let timer: ReturnType<typeof setInterval> | null = null
  let lastSwitchAt = 0
  let lowSamples = 0
  let highSamples = 0

  function currentBandwidth(): number | null {
    const external = options.bandwidthEstimate?.()
    if (external && Number.isFinite(external) && external > 0) return external
    return networkBandwidth()
  }

  function commit(level: MirrorCandidate) {
    lastSwitchAt = Date.now()
    lowSamples = 0
    highSamples = 0
    options.onSelect(level)
  }

  function evaluate() {
    const video = options.videoRef.value
    if (!video || video.paused || video.seeking || !Number.isFinite(video.duration)) return
    if (options.isSwitching()) return
    const levels = options.levels.value
    if (levels.length < 2) return
    if (Date.now() - lastSwitchAt < MIN_SWITCH_INTERVAL_MS) return
    const index = levels.findIndex((level) => level.quality === options.activeQuality.value)
    if (index === -1) return
    const active = levels[index]!
    const ahead = options.bufferAhead()
    const bandwidth = currentBandwidth()
    if (ahead < BUFFER_CRITICAL) {
      highSamples = 0
      lowSamples += 1
      if (lowSamples < DOWNGRADE_SAMPLES) return
      if (bandwidth !== null && qualityBitrate(active.quality) <= bandwidth * SAFETY_MARGIN) return
      const lower = levels[index + 1]
      if (lower) commit(lower)
      return
    }
    if (ahead < BUFFER_RECOVER) {
      lowSamples = 0
      highSamples = 0
      return
    }
    lowSamples = 0
    highSamples += 1
    if (highSamples < UPGRADE_SAMPLES) return
    const higher = levels[index - 1]
    if (!higher) return
    if (bandwidth !== null && qualityBitrate(higher.quality) > bandwidth * SAFETY_MARGIN) return
    commit(higher)
  }

  function start() {
    if (timer) return
    lastSwitchAt = Date.now()
    timer = setInterval(evaluate, CHECK_INTERVAL_MS)
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
  }

  function reset() {
    lastSwitchAt = Date.now()
    lowSamples = 0
    highSamples = 0
  }

  return { reset, start, stop }
}

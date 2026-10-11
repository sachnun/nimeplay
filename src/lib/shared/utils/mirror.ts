const QUALITY_ORDER = ['1080p', '720p', '480p', '360p']

const QUALITY_BITRATE: Record<string, number> = {
  '1080p': 5_000_000,
  '720p': 2_800_000,
  '480p': 1_400_000,
  '360p': 700_000,
}

export const HALF_LIFE_S = 7 * 24 * 60 * 60
export const EXPLORE = 1
const BYTES_PER_BIT = 1 / 8

export function qualityRank(quality: string): number {
  const index = QUALITY_ORDER.indexOf(quality)
  return index === -1 ? 99 : index
}

export function qualityBitrate(quality: string): number {
  const known = QUALITY_BITRATE[quality]
  if (known) return known
  const height = Number.parseInt(quality, 10)
  return Number.isFinite(height) ? height * 4_000 : 2_800_000
}
export interface SourceScoreInput {
  server: string
  quality: string
  alpha: number
  beta: number
  samples: number
  speedBps: number
  ttfMs: number
  updatedAt: number
}

export function decay(value: number, atMs: number, nowMs: number, halfLifeS = HALF_LIFE_S): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  const ageS = Math.max(0, (nowMs - atMs) / 1000)
  return value * Math.exp((-Math.LN2 * ageS) / Math.max(halfLifeS, 1))
}

export function decayedAlpha(stat: SourceScoreInput, nowMs: number, halfLifeS = HALF_LIFE_S): number {
  return Math.max(decay(stat.alpha, stat.updatedAt, nowMs, halfLifeS), 1e-9)
}

export function decayedBeta(stat: SourceScoreInput, nowMs: number, halfLifeS = HALF_LIFE_S): number {
  return Math.max(decay(stat.beta, stat.updatedAt, nowMs, halfLifeS), 1e-9)
}

export function reliability(alpha: number, beta: number): number {
  const total = alpha + beta
  return total <= 0 ? 0.5 : alpha / total
}

export function confidence(alpha: number, beta: number): number {
  const total = alpha + beta
  if (total <= 0) return 0.5
  return Math.sqrt((alpha * beta) / (total * total * (total + 1)))
}

export function speedAdequacy(speedBps: number, quality: string): number {
  const needed = qualityBitrate(quality) * BYTES_PER_BIT
  if (needed <= 0) return 0
  return Math.min(1, Math.max(0, speedBps) / needed)
}

export function statScore(stat: SourceScoreInput, quality: string, nowMs: number, explore = EXPLORE): number {
  const alpha = decayedAlpha(stat, nowMs)
  const beta = decayedBeta(stat, nowMs)
  const adequacy = stat.speedBps > 0 ? speedAdequacy(stat.speedBps, quality) : 1
  return reliability(alpha, beta) * adequacy + explore * confidence(alpha, beta)
}

export function unknownScore(explore = EXPLORE): number {
  return explore * confidence(1, 1)
}

export function sampleSpeed(bytes: number, durationMs: number): number {
  if (!Number.isFinite(bytes) || !Number.isFinite(durationMs) || durationMs <= 0 || bytes <= 0) return 0
  return (bytes / durationMs) * 1000
}

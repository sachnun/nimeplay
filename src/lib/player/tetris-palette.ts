export type Rgb = readonly [number, number, number]

export interface TetrisPalette {
  block: Rgb
  line: Rgb
  glow: Rgb | null
  blockAlpha: number
  lineAlpha: number
  glowAlpha: number
}

const GOLD: Rgb = [245, 197, 66]
const MUTED: Rgb = [210, 212, 216]

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
  const t = clamp01(amount)
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ]
}

export function rgba(color: Rgb, alpha: number): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${clamp01(alpha)})`
}

export function liftRgb(color: Rgb, amount: number): Rgb {
  return mixRgb(color, [255, 255, 255], amount)
}

export function goldPalette(priority: number): TetrisPalette {
  const p = clamp01(priority)
  const block = mixRgb(MUTED, GOLD, p)
  return {
    block,
    line: liftRgb(block, 0.3),
    glow: block,
    blockAlpha: 0.45 + 0.5 * p,
    lineAlpha: 0.6 + 0.38 * p,
    glowAlpha: 0.12 + 0.45 * p,
  }
}

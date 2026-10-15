import { describe, expect, test } from 'bun:test'
import { clamp01, goldPalette, liftRgb, mixRgb, rgba } from './tetris-palette'

describe('clamp01', () => {
  test('clamps and rejects non finite values', () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(0.5)).toBe(0.5)
    expect(clamp01(2)).toBe(1)
    expect(clamp01(Number.NaN)).toBe(0)
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('mixRgb', () => {
  test('blends two colors and rounds', () => {
    expect(mixRgb([0, 0, 0], [255, 255, 255], 0.5)).toEqual([128, 128, 128])
    expect(mixRgb([0, 0, 0], [255, 255, 255], 0)).toEqual([0, 0, 0])
    expect(mixRgb([0, 0, 0], [255, 255, 255], 1)).toEqual([255, 255, 255])
  })
})

describe('rgba', () => {
  test('formats a css color and clamps alpha', () => {
    expect(rgba([1, 2, 3], 0.5)).toBe('rgba(1, 2, 3, 0.5)')
    expect(rgba([1, 2, 3], 5)).toBe('rgba(1, 2, 3, 1)')
  })
})

describe('goldPalette', () => {
  test('clamps priority into the unit interval', () => {
    expect(goldPalette(-5)).toEqual(goldPalette(0))
    expect(goldPalette(5)).toEqual(goldPalette(1))
    expect(goldPalette(Number.NaN)).toEqual(goldPalette(0))
  })

  test('turns more gold as priority rises', () => {
    const muted = goldPalette(0)
    const gold = goldPalette(1)
    expect(gold.block[0]).toBeGreaterThan(muted.block[0])
    expect(gold.block[2]).toBeLessThan(muted.block[2])
    expect(gold.blockAlpha).toBeGreaterThan(muted.blockAlpha)
    expect(gold.lineAlpha).toBeGreaterThan(muted.lineAlpha)
  })

  test('keeps the line color in sync with the block color', () => {
    for (const priority of [0, 0.5, 1]) {
      const palette = goldPalette(priority)
      expect(palette.line).toEqual(liftRgb(palette.block, 0.3))
      expect(palette.glow).toEqual(palette.block)
    }
    expect(goldPalette(1).line[2]).toBeLessThan(goldPalette(0).line[2])
  })

  test('keeps the low priority end near muted white', () => {
    const muted = goldPalette(0)
    expect(muted.block).toEqual([210, 212, 216])
    expect(muted.blockAlpha).toBeLessThan(0.5)
  })
})

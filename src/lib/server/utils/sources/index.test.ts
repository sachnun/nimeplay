import { describe, expect, test } from 'bun:test'
import { splitSource, sourceRank } from './index'

describe('sourceRank', () => {
  test('orders sources by the configured priority', () => {
    expect(sourceRank('otakudesu')).toBe(0)
    expect(sourceRank('ylnime')).toBe(1)
    expect(sourceRank('sokuja')).toBe(2)
  })

  test('pushes unknown sources to the end', () => {
    expect(sourceRank('unknown')).toBe(7)
    expect(sourceRank('')).toBe(7)
  })
})

describe('splitSource', () => {
  test('splits a known source prefix from the rest', () => {
    const split = splitSource('otakudesu:one-piece@1')
    expect(split?.source.id).toBe('otakudesu')
    expect(split?.rest).toBe('one-piece@1')
  })

  test('keeps colons inside the rest', () => {
    expect(splitSource('ylnime:a:b:c')?.rest).toBe('a:b:c')
  })

  test('rejects unknown sources and malformed slugs', () => {
    expect(splitSource('unknown:a')).toBeNull()
    expect(splitSource('otakudesu')).toBeNull()
    expect(splitSource('otakudesu:')).toBeNull()
    expect(splitSource(':abc')).toBeNull()
    expect(splitSource('')).toBeNull()
  })
})

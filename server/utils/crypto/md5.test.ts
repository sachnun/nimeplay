import { describe, expect, test } from 'bun:test'
import { md5Hex } from './md5'

function reference(input: string): string {
  return new Bun.CryptoHasher('md5').update(input).digest('hex')
}

describe('md5Hex', () => {
  test('matches known digests', () => {
    const encoder = new TextEncoder()
    expect(md5Hex(encoder.encode(''))).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5Hex(encoder.encode('a'))).toBe('0cc175b9c0f1b6a831c399e269772661')
    expect(md5Hex(encoder.encode('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5Hex(encoder.encode('The quick brown fox jumps over the lazy dog'))).toBe(
      '9e107d9d372bb6826bd81d3542a419d6',
    )
  })

  test('agrees with Bun crypto for varied inputs', () => {
    const encoder = new TextEncoder()
    const samples = [
      'a',
      'hello world',
      'x'.repeat(55),
      'x'.repeat(56),
      'x'.repeat(64),
      'x'.repeat(65),
      'x'.repeat(1000),
      'ünïcødé 🎌 アニメ',
      'line\nbreak\ttab',
    ]
    for (const sample of samples) {
      expect(md5Hex(encoder.encode(sample))).toBe(reference(sample))
    }
  })

  test('returns 32 lowercase hex characters', () => {
    const encoder = new TextEncoder()
    expect(md5Hex(encoder.encode('nimeplay'))).toMatch(/^[0-9a-f]{32}$/)
  })

  test('handles multi-block boundary lengths', () => {
    const encoder = new TextEncoder()
    for (const length of [55, 56, 57, 63, 64, 65, 119, 120, 128]) {
      const sample = 'a'.repeat(length)
      expect(md5Hex(encoder.encode(sample))).toBe(reference(sample))
    }
  })
})

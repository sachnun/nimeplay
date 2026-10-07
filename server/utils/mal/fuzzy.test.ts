import { describe, expect, test } from 'bun:test'
import { jaroWinkler, titleSimilarity, tokenSetRatio } from './fuzzy'

describe('jaroWinkler', () => {
  test('returns 1 for identical strings', () => {
    expect(jaroWinkler('naruto', 'naruto')).toBe(1)
  })

  test('returns 0 when there is no overlap', () => {
    expect(jaroWinkler('abc', 'xyz')).toBe(0)
  })

  test('scores known transposition above unrelated strings', () => {
    const close = jaroWinkler('martha', 'marhta')
    const far = jaroWinkler('martha', 'zzzzzz')
    expect(close).toBeGreaterThan(0.9)
    expect(close).toBeGreaterThan(far)
  })

  test('applies the prefix bonus above the threshold', () => {
    expect(jaroWinkler('prefixx', 'prefixy')).toBeGreaterThan(jaroWinkler('xprefix', 'yprefix'))
  })
})

describe('tokenSetRatio', () => {
  test('is 1 when token sets match regardless of order', () => {
    expect(tokenSetRatio('Attack on Titan', 'Titan Attack on')).toBe(1)
  })

  test('penalizes partial token overlap', () => {
    const partial = tokenSetRatio('Attack on Titan', 'Titanic Attack')
    expect(partial).toBeGreaterThan(0.5)
    expect(partial).toBeLessThan(1)
  })

  test('handles empty input', () => {
    expect(tokenSetRatio('', '')).toBe(1)
    expect(tokenSetRatio('naruto', '')).toBe(0)
  })
})

describe('titleSimilarity', () => {
  test('returns 1 for identical titles', () => {
    expect(titleSimilarity('Naruto', 'Naruto')).toBe(1)
  })

  test('is case and punctuation insensitive', () => {
    expect(titleSimilarity('Attack on Titan', 'attack on titan!')).toBe(1)
  })

  test('scores a related title above an unrelated one', () => {
    const related = titleSimilarity('Attack on Titan', 'Attack on Titan Season 2')
    const unrelated = titleSimilarity('Attack on Titan', 'Bleach')
    expect(related).toBeGreaterThan(unrelated)
  })

  test('returns 0 for empty input', () => {
    expect(titleSimilarity('', 'Naruto')).toBe(0)
    expect(titleSimilarity('!!!', '???')).toBe(0)
  })
})

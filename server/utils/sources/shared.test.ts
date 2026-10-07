import { describe, expect, test } from 'bun:test'
import { cleanTitleWithRules, keepSeriesEpisodes, parseEpisodeDate } from './shared'

describe('cleanTitleWithRules', () => {
  test('removes matches for regexp rules', () => {
    expect(cleanTitleWithRules('Naruto Sub Indo', [/Sub Indo/gi])).toBe('Naruto')
  })

  test('replacement tuples substitute the match', () => {
    expect(cleanTitleWithRules('Naruto + OVA', [[/\+ OVA/g, ' OVA']])).toBe('Naruto  OVA')
  })

  test('applies rules in order and trims the result', () => {
    expect(cleanTitleWithRules('  Naruto Sub Indo BD  ', [/Sub Indo/gi, /\s+BD\b/])).toBe('Naruto')
  })

  test('returns the trimmed title when there are no rules', () => {
    expect(cleanTitleWithRules('  Naruto  ', [])).toBe('Naruto')
  })
})

describe('parseEpisodeDate', () => {
  test('handles indonesian relative days', () => {
    const today = parseEpisodeDate('Hari Ini')
    const yesterday = parseEpisodeDate('Kemarin')
    expect(today).toBeInstanceOf(Date)
    expect(yesterday).toBeInstanceOf(Date)
    expect(today!.getTime() - yesterday!.getTime()).toBeCloseTo(86_400_000, -4)
  })

  test('handles relative amounts and units', () => {
    const fiveDays = parseEpisodeDate('5 hari lalu')
    const twoHours = parseEpisodeDate('2 jam lalu')
    expect(fiveDays).toBeInstanceOf(Date)
    expect(twoHours).toBeInstanceOf(Date)
    expect(Date.now() - fiveDays!.getTime()).toBeCloseTo(5 * 86_400_000, -5)
    expect(Date.now() - twoHours!.getTime()).toBeCloseTo(2 * 3_600_000, -5)
  })

  test('parses absolute dates in indonesian months', () => {
    expect(parseEpisodeDate('15 Jan 2024')?.toISOString()).toBe('2024-01-15T00:00:00.000Z')
    expect(parseEpisodeDate('15 Januari 2024')?.toISOString()).toBe('2024-01-15T00:00:00.000Z')
    expect(parseEpisodeDate('31 Des 2023')?.toISOString()).toBe('2023-12-31T00:00:00.000Z')
  })

  test('rejects invalid and unparsable input', () => {
    expect(parseEpisodeDate('31 Feb 2024')).toBeNull()
    expect(parseEpisodeDate('abc')).toBeNull()
    expect(parseEpisodeDate('')).toBeNull()
    expect(parseEpisodeDate('   ')).toBeNull()
  })
})

describe('keepSeriesEpisodes', () => {
  const episodes = [
    { title: 'Naruto Episode 1' },
    { title: 'Naruto Episode 2' },
    { title: 'Naruto Episode 3' },
    { title: 'Bleach Episode 1' },
    { title: 'One Piece Episode 1' },
  ]

  test('keeps the dominant labeled series', () => {
    expect(keepSeriesEpisodes('Naruto', 'naruto', episodes).map(episode => episode.title)).toEqual([
      'Naruto Episode 1',
      'Naruto Episode 2',
      'Naruto Episode 3',
    ])
  })

  test('keeps entries matching the series title even without a dominant label', () => {
    const mixed = [{ title: 'Naruto Episode 1' }, { title: 'Bleach Episode 1' }]
    expect(keepSeriesEpisodes('Naruto', 'naruto', mixed).map(episode => episode.title)).toEqual(['Naruto Episode 1'])
  })

  test('keeps everything when no entry has a usable label', () => {
    const unlabeled = [{ title: 'Episode 1' }, { title: 'Episode 2' }]
    expect(keepSeriesEpisodes('Naruto', 'naruto', unlabeled).map(episode => episode.title)).toEqual([
      'Episode 1',
      'Episode 2',
    ])
  })
})

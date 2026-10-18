import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { BLOCKED_GENRE_SLUGS, PAGE_SIZE, formatSeason, statusCondition } from './shared'

describe('constants', () => {
  test('exposes the page size and blocked genres', () => {
    expect(PAGE_SIZE).toBe(48)
    expect(BLOCKED_GENRE_SLUGS).toEqual(['hentai'])
  })
})

describe('formatSeason', () => {
  test('title cases the season and appends the year', () => {
    expect(formatSeason('winter', 2024)).toBe('Winter 2024')
    expect(formatSeason('fall', 1999)).toBe('Fall 1999')
  })

  test('title cases multi word seasons', () => {
    expect(formatSeason('spring', 2024)).toBe('Spring 2024')
  })

  test('handles a missing year', () => {
    expect(formatSeason('summer', null)).toBe('Summer')
  })

  test('handles a missing season', () => {
    expect(formatSeason(null, 2024)).toBe('2024')
    expect(formatSeason(null, null)).toBe('')
  })
})

function renderStatus(status: 'ONGOING' | 'COMPLETED'): string {
  return new PgDialect().sqlToQuery(statusCondition(status)).sql
}

describe('statusCondition', () => {
  test('keeps completed anime out of the ongoing list', () => {
    const sql = renderStatus('ONGOING')
    expect(sql).toContain(`"anime"."status" is distinct from 'COMPLETED'`)
    expect(sql).toContain('latest_episode_at')
  })

  test('matches completed anime by status only', () => {
    const sql = renderStatus('COMPLETED')
    expect(sql).toContain('"anime"."status" =')
    expect(sql).not.toContain('latest_episode_at')
  })
})

import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { fetchSkipTimes } from './skip'
import type { SkipTime } from './types'

const spies: { mockRestore(): void }[] = []

const captured: { url: string; init?: RequestInit } = { url: '' }

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): void {
  spies.push(
    spyOn(globalThis, 'fetch').mockImplementation((async (url: string, init?: RequestInit) => {
      captured.url = url
      captured.init = init
      return handler(url, init)
    }) as unknown as typeof fetch),
  )
}

afterEach(() => {
  for (const spy of spies) spy.mockRestore()
  spies.length = 0
  captured.url = ''
  captured.init = undefined
})

const opening: SkipTime = {
  interval: { startTime: 0, endTime: 90 },
  skipType: 'op',
  skipId: 'op-1',
  episodeLength: 1440,
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('fetchSkipTimes', () => {
  test('posts the episode payload and returns the intervals', async () => {
    mockFetch(async () => json({ found: true, results: [opening] }))

    expect(await fetchSkipTimes(21, 3, 1440.7)).toEqual([opening])
    expect(captured.url).toBe('/api/v1/skip')
    expect(captured.init?.method).toBe('POST')
    expect(JSON.parse(String(captured.init?.body))).toEqual({ malId: 21, episode: 3, episodeLength: 1440 })
  })

  test('returns an empty list when no interval was found', async () => {
    mockFetch(async () => json({ found: false, results: [opening] }))
    expect(await fetchSkipTimes(21, 3, 1440)).toEqual([])
  })

  test('returns an empty list on a non ok response', async () => {
    mockFetch(async () => json({}, 503))
    expect(await fetchSkipTimes(21, 3, 1440)).toEqual([])
  })

  test('returns an empty list when the request fails', async () => {
    mockFetch(async () => {
      throw new Error('offline')
    })
    expect(await fetchSkipTimes(21, 3, 1440)).toEqual([])
  })
})

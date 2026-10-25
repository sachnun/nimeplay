import { describe, expect, test } from 'bun:test'
import { fetchAnimeSummaries } from './summaries'
import type { AnimeSummary } from './types'

const summaries: AnimeSummary[] = [
  { malId: 1, title: 'Cowboy Bebop', thumbnail: '/media/posters/a.webp' },
  { malId: 2, title: 'Trigun', thumbnail: '/media/posters/b.webp' },
]

function stubFetch(handler: (url: string) => Promise<Response>): typeof fetch {
  return handler as unknown as typeof fetch
}

describe('fetchAnimeSummaries', () => {
  test('requests every mal id as a repeated query param', async () => {
    let requested = ''
    const data = await fetchAnimeSummaries(
      stubFetch(async url => {
        requested = url
        return Response.json({ data: summaries })
      }),
      [1, 2],
    )
    expect(requested).toBe('/api/summaries?malId=1&malId=2')
    expect(data).toEqual(summaries)
  })

  test('skips the request for an empty id list', async () => {
    let called = false
    const data = await fetchAnimeSummaries(
      stubFetch(async () => {
        called = true
        return Response.json({ data: [] })
      }),
      [],
    )
    expect(called).toBe(false)
    expect(data).toEqual([])
  })

  test('rejects with the status on a failed response', async () => {
    const promise = fetchAnimeSummaries(stubFetch(async () => new Response('nope', { status: 500 })), [1])
    await expect(promise).rejects.toThrow('Request failed: 500')
  })
})

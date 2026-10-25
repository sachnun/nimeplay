import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { extractOdcloud } from './odcloud'

const spies: { mockRestore(): void }[] = []

function mockFetch(handler: (url: string) => Response): void {
  spies.push(
    spyOn(globalThis, 'fetch').mockImplementation((async (url: string) => handler(url)) as unknown as typeof fetch),
  )
}

afterEach(() => {
  for (const spy of spies) spy.mockRestore()
  spies.length = 0
})

const EMBED = 'https://odcloud.net/dstream/abc'

describe('extractOdcloud', () => {
  test('reads videoURL from the page', async () => {
    expect(await extractOdcloud(EMBED, '<script>var videoURL = "https://cdn.example/v.mp4";</script>')).toBe(
      'https://cdn.example/v.mp4',
    )
  })

  test('reads a single quoted videoURL', async () => {
    expect(await extractOdcloud(EMBED, `<script>var videoURL = 'https://cdn.example/v.mp4';</script>`)).toBe(
      'https://cdn.example/v.mp4',
    )
  })

  test('reads a source tag and resolves it against the embed', async () => {
    expect(await extractOdcloud(EMBED, '<video><source src="/media/v.mp4"></video>')).toBe(
      'https://odcloud.net/media/v.mp4',
    )
  })

  test('reads a playerjs file entry', async () => {
    expect(await extractOdcloud(EMBED, `<script>player.setup({ file: "https://cdn.example/v.mp4" })</script>`)).toBe(
      'https://cdn.example/v.mp4',
    )
  })

  test('falls back to the first mp4 url on the page', async () => {
    expect(await extractOdcloud(EMBED, '<p>https://cdn.example/direct.mp4?token=1</p>')).toBe(
      'https://cdn.example/direct.mp4?token=1',
    )
  })

  test('skips placeholder urls and keeps looking', async () => {
    const html = '<source src="https://samplelib.com/bbb.mp4"><script>var videoURL = "https://cdn.example/real.mp4"</script>'
    expect(await extractOdcloud(EMBED, html)).toBe('https://cdn.example/real.mp4')
  })

  test('fetches the embed when the html has nothing useful', async () => {
    mockFetch(() => new Response('<script>var videoURL = "https://cdn.example/fetched.mp4"</script>'))
    expect(await extractOdcloud(EMBED, '<html></html>')).toBe('https://cdn.example/fetched.mp4')
  })

  test('returns null when the fetched page has no url', async () => {
    mockFetch(() => new Response('<html></html>'))
    expect(await extractOdcloud(EMBED, '<html></html>')).toBeNull()
  })

  test('returns null when the fetch fails', async () => {
    mockFetch(() => new Response('', { status: 404 }))
    expect(await extractOdcloud(EMBED, '<html></html>')).toBeNull()
  })
})

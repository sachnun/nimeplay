import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { extractNekoclouds } from './nekoclouds'

const EMBED = 'https://nekoclouds.com/embed/abc123'

const spies: { mockRestore(): void }[] = []

interface Mocked {
  page?: Response
  authorize?: Response
}

function mockFetch(mocked: Mocked): { authorizeCalls: { url: string; init?: RequestInit }[] } {
  const authorizeCalls: { url: string; init?: RequestInit }[] = []
  spies.push(
    spyOn(globalThis, 'fetch').mockImplementation((async (url: string, init?: RequestInit) => {
      if (url.includes('/authorize')) {
        authorizeCalls.push({ url, init })
        return mocked.authorize ?? new Response('', { status: 404 })
      }
      return mocked.page ?? new Response('', { status: 404 })
    }) as unknown as typeof fetch),
  )
  return { authorizeCalls }
}

afterEach(() => {
  for (const spy of spies) spy.mockRestore()
  spies.length = 0
})

const CSRF_HTML = '<meta name="csrf-token" content="token-1">'

describe('extractNekoclouds', () => {
  test('authorizes with the media id from the embed url', async () => {
    const { authorizeCalls } = mockFetch({
      page: new Response(CSRF_HTML),
      authorize: Response.json({ status: 'ok', manifest_url: 'https://cdn.example/master.m3u8' }),
    })

    expect(await extractNekoclouds(EMBED, CSRF_HTML)).toBe('https://cdn.example/master.m3u8')
    expect(authorizeCalls).toHaveLength(1)
    expect(authorizeCalls[0]?.url).toBe('https://nekoclouds.com/playback/abc123/authorize')
    expect(authorizeCalls[0]?.init?.method).toBe('POST')
  })

  test('resolves a relative manifest against the embed origin', async () => {
    mockFetch({
      page: new Response(CSRF_HTML),
      authorize: Response.json({ status: 'ok', manifest_url: '/hls/master.m3u8' }),
    })
    expect(await extractNekoclouds(EMBED, CSRF_HTML)).toBe('https://nekoclouds.com/hls/master.m3u8')
  })

  test('rejects a response without the ok status', async () => {
    mockFetch({
      page: new Response(CSRF_HTML),
      authorize: Response.json({ status: 'error', manifest_url: 'https://cdn.example/master.m3u8' }),
    })
    expect(await extractNekoclouds(EMBED, CSRF_HTML)).toBeNull()
  })

  test('rejects a response without a manifest', async () => {
    mockFetch({ page: new Response(CSRF_HTML), authorize: Response.json({ status: 'ok' }) })
    expect(await extractNekoclouds(EMBED, CSRF_HTML)).toBeNull()
  })

  test('returns null when the embed page cannot be fetched', async () => {
    mockFetch({})
    expect(await extractNekoclouds('https://nekoclouds.com/e/abc123', '<html></html>')).toBeNull()
  })

  test('reads the media id and csrf token from the embed page', async () => {
    const page = new Response(`${CSRF_HTML}<script>mediaId: "frompage"</script>`)
    const { authorizeCalls } = mockFetch({
      page,
      authorize: Response.json({ status: 'ok', manifest_url: 'https://cdn.example/master.m3u8' }),
    })
    expect(await extractNekoclouds('https://nekoclouds.com/e/abc123', '<html></html>')).toBe(
      'https://cdn.example/master.m3u8',
    )
    expect(authorizeCalls[0]?.url).toBe('https://nekoclouds.com/playback/frompage/authorize')
  })

  test('returns null when authorization fails', async () => {
    mockFetch({ page: new Response(CSRF_HTML), authorize: new Response('', { status: 403 }) })
    expect(await extractNekoclouds(EMBED, CSRF_HTML)).toBeNull()
  })
})

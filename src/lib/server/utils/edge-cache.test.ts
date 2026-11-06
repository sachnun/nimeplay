import { afterEach, describe, expect, test } from 'bun:test'
import { edgeCacheKey, isCacheable, readEdgeCache, writeEdgeCache } from './edge-cache'

const global = globalThis as { caches?: unknown }
const original = global.caches

function installStore(): Map<string, Response> {
  const entries = new Map<string, Response>()
  global.caches = {
    default: {
      match: async (request: Request) => entries.get(request.url),
      put: async (request: Request, response: Response) => {
        entries.set(request.url, response)
      },
    },
  }
  return entries
}

afterEach(() => {
  global.caches = original
})

describe('edge cache keys', () => {
  test('normalises to a GET request', () => {
    expect(edgeCacheKey(new URL('https://example.com/a?b=1')).method).toBe('GET')
    expect(edgeCacheKey(new URL('https://example.com/a?b=1')).url).toBe('https://example.com/a?b=1')
  })
})

describe('isCacheable', () => {
  const request = new Request('https://example.com/', { method: 'GET' })

  test('accepts a plain 200 response', () => {
    expect(isCacheable(request, new Response('ok', { status: 200 }))).toBe(true)
  })

  test('rejects error responses', () => {
    expect(isCacheable(request, new Response('boom', { status: 503 }))).toBe(false)
  })

  test('rejects personalised requests', () => {
    const withCookie = new Request('https://example.com/', { headers: { cookie: 'session=1' } })
    const withAuth = new Request('https://example.com/', { headers: { authorization: 'token' } })
    expect(isCacheable(withCookie, new Response('ok'))).toBe(false)
    expect(isCacheable(withAuth, new Response('ok'))).toBe(false)
  })

  test('rejects non GET methods', () => {
    const post = new Request('https://example.com/', { method: 'POST' })
    expect(isCacheable(post, new Response('ok'))).toBe(false)
  })
})

describe('edge cache read and write', () => {
  test('serves a stored response without a second lookup miss', async () => {
    installStore()
    const url = new URL('https://example.com/')
    const request = new Request(url)
    expect(await readEdgeCache(url)).toBeNull()

    await writeEdgeCache(url, request, new Response('<html>hi</html>', { status: 200 }))
    const hit = await readEdgeCache(url)
    expect(hit?.status).toBe(200)
    expect(await hit?.text()).toBe('<html>hi</html>')
  })

  test('skips writing uncacheable responses', async () => {
    const entries = installStore()
    const url = new URL('https://example.com/')
    await writeEdgeCache(url, new Request(url), new Response('boom', { status: 503 }))
    expect(entries.size).toBe(0)
  })

  test('skips writing when a cookie is present', async () => {
    const entries = installStore()
    const url = new URL('https://example.com/')
    const request = new Request(url, { headers: { cookie: 'session=1' } })
    await writeEdgeCache(url, request, new Response('ok'))
    expect(entries.size).toBe(0)
  })

  test('degrades gracefully without a cache binding', async () => {
    global.caches = undefined
    const url = new URL('https://example.com/')
    expect(await readEdgeCache(url)).toBeNull()
    await expect(writeEdgeCache(url, new Request(url), new Response('ok'))).resolves.toBeUndefined()
  })

  test('ignores cache failures', async () => {
    global.caches = {
      default: {
        match: async () => {
          throw new Error('cache down')
        },
        put: async () => {
          throw new Error('cache down')
        },
      },
    }
    const url = new URL('https://example.com/')
    expect(await readEdgeCache(url)).toBeNull()
    await expect(writeEdgeCache(url, new Request(url), new Response('ok'))).resolves.toBeUndefined()
  })
})

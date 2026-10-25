import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { extractMega, isMega, megaKeyFromUrl } from './mega'

describe('isMega', () => {
  test('matches mega embeds and files', () => {
    expect(isMega('https://mega.nz/embed/abc#key')).toBe(true)
    expect(isMega('https://mega.nz/file/abc#key')).toBe(true)
    expect(isMega('https://mega.nz/folder/abc#key')).toBe(true)
    expect(isMega('https://example.com/embed/abc#key')).toBe(false)
  })
})

describe('megaKeyFromUrl', () => {
  test('reads the fragment of a mega cdn url', () => {
    expect(megaKeyFromUrl('https://gfs1.userstorage.mega.co.nz/cs?id=1#KEY')).toBe('KEY')
    expect(megaKeyFromUrl('https://gfs1.userstorage.mega.co.nz/cs?id=1')).toBeNull()
  })

  test('ignores other hosts and unparsable urls', () => {
    expect(megaKeyFromUrl('https://cdn.example/v.mp4#KEY')).toBeNull()
    expect(megaKeyFromUrl('not a url')).toBeNull()
  })
})

describe('extractMega', () => {
  const spies: { mockRestore(): void }[] = []

  afterEach(() => {
    for (const spy of spies) spy.mockRestore()
    spies.length = 0
  })

  function mockFetch(handler: () => Response): void {
    spies.push(
      spyOn(globalThis, 'fetch').mockImplementation((async () => handler()) as unknown as typeof fetch),
    )
  }

  test('returns null without a handle or key', async () => {
    expect(await extractMega('https://mega.nz/embed/')).toBeNull()
    expect(await extractMega('https://mega.nz/embed/abc')).toBeNull()
    expect(await extractMega('not a url')).toBeNull()
  })

  test('appends the key to the resolved download url', async () => {
    mockFetch(() => Response.json([{ g: 'https://gfs1.userstorage.mega.co.nz/cs?id=1' }]))
    expect(await extractMega('https://mega.nz/embed/abc#KEY')).toBe(
      'https://gfs1.userstorage.mega.co.nz/cs?id=1#KEY',
    )
  })

  test('returns null when mega rejects the handle', async () => {
    mockFetch(() => Response.json([{ e: -9 }]))
    expect(await extractMega('https://mega.nz/embed/abc#KEY')).toBeNull()
  })

  test('returns null on a failed request', async () => {
    mockFetch(() => new Response('', { status: 500 }))
    expect(await extractMega('https://mega.nz/embed/abc#KEY')).toBeNull()
  })
})

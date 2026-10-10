import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { getSpoofHeaders } from './spoof'

const spies: { mockRestore(): void }[] = []

function mockRandom(value: number): void {
  spies.push(spyOn(Math, 'random').mockReturnValue(value))
}

afterEach(() => {
  for (const spy of spies) spy.mockRestore()
  spies.length = 0
})

describe('getSpoofHeaders', () => {
  test('always provides a user agent and accept language', () => {
    const headers = getSpoofHeaders()
    expect(headers['User-Agent']).toBeTruthy()
    expect(headers['Accept-Language']).toBeTruthy()
  })

  test('generates a consistent public ip across forwarded headers', () => {
    for (let i = 0; i < 20; i++) {
      const headers = getSpoofHeaders()
      const ip = headers['X-Forwarded-For'] ?? ''
      const [a, b] = ip.split('.').map(Number)
      expect(headers['X-Real-IP']).toBe(ip)
      expect(headers['True-Client-IP']).toBe(ip)
      expect(headers.Forwarded).toBe(`for=${ip};proto=https`)
      expect(a).toBeGreaterThanOrEqual(1)
      expect(a).toBeLessThanOrEqual(223)
      expect(a).not.toBe(10)
      expect(a).not.toBe(127)
      expect(a === 172 && (b ?? -1) >= 16 && (b ?? -1) <= 31).toBe(false)
      expect(a === 192 && b === 168).toBe(false)
      expect(a === 100 && (b ?? -1) >= 64 && (b ?? -1) <= 127).toBe(false)
      expect(a === 169 && b === 254).toBe(false)
    }
  })

  test('sets navigation fetch metadata for chromium', () => {
    mockRandom(0)
    const headers = getSpoofHeaders(undefined, 'navigate')
    expect(headers['Sec-Fetch-Dest']).toBe('document')
    expect(headers['Sec-Fetch-Mode']).toBe('navigate')
    expect(headers['Sec-Fetch-Site']).toBe('none')
    expect(headers['Upgrade-Insecure-Requests']).toBe('1')
    expect(headers['Sec-CH-UA']).toBeTruthy()
    expect(headers.Accept).toContain('text/html')
  })

  test('marks same-origin navigation when a referer is given', () => {
    mockRandom(0)
    const headers = getSpoofHeaders('https://ref.example/a', 'navigate')
    expect(headers.Referer).toBe('https://ref.example/a')
    expect(headers['Sec-Fetch-Site']).toBe('same-origin')
  })

  test('sets cors fetch metadata', () => {
    mockRandom(0)
    const headers = getSpoofHeaders(undefined, 'cors')
    expect(headers['Sec-Fetch-Dest']).toBe('empty')
    expect(headers['Sec-Fetch-Mode']).toBe('cors')
    expect(headers['Sec-Fetch-Site']).toBe('same-origin')
    expect(headers.Accept).toBe('*/*')
  })

  test('sets iframe fetch metadata', () => {
    mockRandom(0)
    const headers = getSpoofHeaders(undefined, 'iframe')
    expect(headers['Sec-Fetch-Dest']).toBe('iframe')
    expect(headers['Sec-Fetch-Mode']).toBe('navigate')
    expect(headers['Sec-Fetch-Site']).toBe('cross-site')
  })

  test('encodes non latin1 referers', () => {
    mockRandom(0)
    const headers = getSpoofHeaders('https://ref.example/アニメ', 'navigate')
    expect(headers.Referer).toBe(encodeURI('https://ref.example/アニメ'))
  })

  test('omits client hints for non chromium user agents', () => {
    mockRandom(0.6)
    const headers = getSpoofHeaders(undefined, 'navigate')
    expect(headers['User-Agent']).toContain('Firefox')
    expect('Sec-CH-UA' in headers).toBe(false)
  })
})

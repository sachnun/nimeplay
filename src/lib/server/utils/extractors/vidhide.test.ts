import { describe, expect, test } from 'bun:test'
import { extractVidhide } from './vidhide'

const EMBED = 'https://vidhide.com/e/abc'

function packed(payload: string): string {
  return `eval(function(p,a,c,k,e,d){return p}('${payload}',2,2,'var|links'))`
}

describe('extractVidhide', () => {
  test('prefers the 720p hls playlist', async () => {
    const html = packed(`0 1={"hls4":"https://cdn.example/4.m3u8","hls3":"https://cdn.example/3.m3u8"}`)
    expect(await extractVidhide(EMBED, html)).toBe('https://cdn.example/3.m3u8')
  })

  test('falls back to the highest available playlist', async () => {
    const html = packed(`0 1={"hls4":"https://cdn.example/4.m3u8","hls3":null}`)
    expect(await extractVidhide(EMBED, html)).toBe('https://cdn.example/4.m3u8')
  })

  test('resolves a relative playlist against the embed origin', async () => {
    const html = packed(`0 1={"hls3":"/hls/3.m3u8"}`)
    expect(await extractVidhide(EMBED, html)).toBe('https://vidhide.com/hls/3.m3u8')
  })

  test('returns null without a packer payload', async () => {
    expect(await extractVidhide(EMBED, '<html></html>')).toBeNull()
  })

  test('returns null when the payload has no playlists', async () => {
    expect(await extractVidhide(EMBED, packed('0 1={"other":"x"}'))).toBeNull()
  })
})

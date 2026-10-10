import { beforeAll, describe, expect, test } from 'bun:test'
import { sealStreamToken } from '../media/stream'
import { mirrorsArePlayable } from './episode-cache'

const SECRET = '0123456789abcdef0123456789abcdef'

beforeAll(() => {
  process.env.STREAM_SECRET = SECRET
})

async function mirror(dataContents: string[]) {
  return [{ quality: '720p', sources: dataContents.map((dataContent, index) => ({ name: `s${index}`, dataContent })) }]
}

describe('mirrorsArePlayable', () => {
  test('accepts a mirror whose tokens can be opened', async () => {
    const token = await sealStreamToken('otakudesu:payload', 60_000)
    expect(await mirrorsArePlayable(await mirror([token]))).toBe(true)
  })

  test('accepts a mirror when only one token is still readable', async () => {
    const token = await sealStreamToken('otakudesu:payload', 60_000)
    expect(await mirrorsArePlayable(await mirror(['not-a-token', token]))).toBe(true)
  })

  test('rejects a mirror when every token is unreadable', async () => {
    expect(await mirrorsArePlayable(await mirror(['not-a-token', 'also-bad']))).toBe(false)
  })

  test('rejects expired tokens', async () => {
    const token = await sealStreamToken('otakudesu:payload', -1000)
    expect(await mirrorsArePlayable(await mirror([token]))).toBe(false)
  })

  test('rejects empty mirrors', async () => {
    expect(await mirrorsArePlayable([])).toBe(false)
  })
})

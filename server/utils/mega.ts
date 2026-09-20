import { fromBase64Url } from './stream'
import { upstreamHeadersFor } from './extractors/hosts'

const API_HOST = 'g.api.mega.co.nz'
const CDN_SUFFIX = 'userstorage.mega.co.nz'
const BLOCK = 16
const FETCH_TIMEOUT_MS = 20_000

export interface MegaStream {
  body: ReadableStream<Uint8Array>
  status: number
  contentType: string
  start: number
  end: number
  total: number
}

export function isMega(url: string): boolean {
  const lower = url.toLowerCase()
  return lower.includes('mega.nz/embed/') || lower.includes('mega.nz/file/') || lower.includes('mega.nz/folder/')
}

export function megaKeyFromUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    return null
  }
  if (!parsed.host.endsWith(CDN_SUFFIX)) return null
  return parsed.hash.slice(1) || null
}

export async function resolveMegaDownload(handle: string): Promise<string | null> {
  try {
    const res = await fetch(`https://${API_HOST}/cs?id=0&n=${encodeURIComponent(handle)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([{ a: 'g', p: handle, g: 1 }]),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json() as { g?: string }[]
    const url = data?.[0]?.g
    return typeof url === 'string' && url.startsWith('http') ? url : null
  }
  catch {
    return null
  }
}

export async function extractMega(embedUrl: string): Promise<string | null> {
  let parsed: URL
  try {
    parsed = new URL(embedUrl)
  }
  catch {
    return null
  }
  const handle = parsed.pathname.match(/\/(?:embed|file|folder)\/([A-Za-z0-9_-]+)/)?.[1]
  const key = parsed.hash.slice(1)
  if (!handle || !key) return null
  const download = await resolveMegaDownload(handle)
  return download ? `${download}#${key}` : null
}

function ctrCounter(key: Uint8Array, blockIndex: number): Uint8Array {
  const counter = new Uint8Array(BLOCK)
  counter.set(key.subarray(16, 24), 0)
  let carry = blockIndex
  for (let i = BLOCK - 1; i >= 0 && carry > 0; i--) {
    const sum = counter[i]! + (carry % 256)
    counter[i] = sum % 256
    carry = Math.floor(carry / 256) + Math.floor(sum / 256)
  }
  return counter
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

function parseRange(range: string | undefined): { start: number, end: number | null } {
  const match = range?.match(/bytes=(\d+)-(\d*)/)
  if (!match) return { start: 0, end: null }
  return { start: Number(match[1]), end: match[2] ? Number(match[2]) : null }
}

export async function streamMega(target: string, megaKey: string, range?: string): Promise<MegaStream> {
  const key = fromBase64Url(megaKey)
  if (key.length < 32) throw new Error('Invalid mega key')

  const aesKey = new Uint8Array(16)
  for (let i = 0; i < 16; i++) aesKey[i] = key[i]! ^ key[16 + i]!

  const { start, end } = parseRange(range)
  const hasRange = !!range
  const alignedStart = start - (start % BLOCK)
  const upstream = await fetch(target, {
    headers: upstreamHeadersFor(target, `bytes=${alignedStart}-${end ?? ''}`),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!upstream.ok && upstream.status !== 206) throw new Error(`Mega upstream ${upstream.status}`)
  if (!upstream.body) throw new Error('Empty mega response')

  const contentRange = upstream.headers.get('content-range')
  const total = Number(contentRange?.split('/')[1]) || Number(upstream.headers.get('content-length')) || 0
  const outEnd = end !== null ? Math.min(end, total - 1) : total - 1

  const cipher = await crypto.subtle.importKey('raw', aesKey, 'AES-CTR', false, ['decrypt'])
  const reader = upstream.body.getReader()
  let cipherOffset = alignedStart
  let pending = new Uint8Array(0)
  let skipLeft = start - alignedStart
  let remaining = outEnd - start + 1

  const decrypt = (block: Uint8Array) => crypto.subtle.decrypt(
    { name: 'AES-CTR', counter: ctrCounter(key, cipherOffset / BLOCK) as Uint8Array<ArrayBuffer>, length: 128 },
    cipher,
    block as Uint8Array<ArrayBuffer>,
  )

  const trim = (plain: Uint8Array): Uint8Array => {
    let chunk = plain
    if (skipLeft > 0) {
      const drop = Math.min(skipLeft, chunk.length)
      chunk = chunk.subarray(drop)
      skipLeft -= drop
    }
    return chunk.length > remaining ? chunk.subarray(0, remaining) : chunk
  }

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (remaining > 0) {
          if (pending.length < BLOCK) {
            const { done, value } = await reader.read()
            if (done) {
              if (pending.length > 0) {
                const padded = new Uint8Array(BLOCK)
                padded.set(pending)
                const plain = new Uint8Array(await decrypt(padded))
                const realLen = pending.length
                pending = new Uint8Array(0)
                const chunk = trim(plain.subarray(0, realLen))
                remaining -= chunk.length
                if (chunk.length > 0) controller.enqueue(chunk as Uint8Array<ArrayBuffer>)
              }
              else {
                controller.close()
              }
              return
            }
            pending = concat(pending, value)
            continue
          }
          const usable = pending.length - (pending.length % BLOCK)
          const block = pending.subarray(0, usable)
          pending = pending.subarray(usable)
          const plain = new Uint8Array(await decrypt(block))
          cipherOffset += usable
          const chunk = trim(plain)
          remaining -= chunk.length
          if (chunk.length > 0) controller.enqueue(chunk as Uint8Array<ArrayBuffer>)
          return
        }
        controller.close()
      }
      catch (error) {
        controller.error(error)
      }
    },
    cancel() {
      reader.cancel().catch(() => {})
    },
  })

  return {
    body,
    status: hasRange ? 206 : 200,
    contentType: 'video/mp4',
    start,
    end: outEnd,
    total,
  }
}

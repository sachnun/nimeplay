import { proxyUrl } from './proxy'

interface PlainResponse {
  status: number
  text: string
}

interface PlainOptions {
  headers?: Record<string, string>
  timeoutMs?: number
}

interface NodeRequest {
  on: (event: string, cb: (arg?: unknown) => void) => void
  setTimeout: (ms: number, cb: () => void) => void
  end: () => void
  destroy: () => void
}

interface NodeResponse {
  statusCode?: number
  headers: Record<string, string | string[] | undefined>
  on: (event: string, cb: (chunk?: unknown) => void) => void
}

interface NodeHttps {
  request: (
    url: string,
    options: { method: string, headers: Record<string, string> },
    cb: (res: NodeResponse) => void,
  ) => NodeRequest
}

interface PlainBinaryResponse {
  status: number
  contentType: string
  bytes: Uint8Array
}

const DEFAULT_UA = 'okhttp/4.9.0'
const DEFAULT_TIMEOUT_MS = 8000

const modules = new Map<string, Promise<NodeHttps | null>>()

function loadModule(url: string): Promise<NodeHttps | null> {
  const specifier = url.startsWith('http://') ? 'node:http' : 'node:https'
  let loaded = modules.get(specifier)
  if (!loaded) {
    loaded = (async () => {
      try {
        return await import(/* @vite-ignore */ specifier) as NodeHttps
      }
      catch {
        return null
      }
    })()
    modules.set(specifier, loaded)
  }
  return loaded
}

export async function plainGet(url: string, options: PlainOptions = {}): Promise<PlainResponse | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const headers = {
    'user-agent': DEFAULT_UA,
    'accept': 'application/json, */*',
    ...options.headers,
  }
  const target = proxyUrl(url)
  const https = await loadModule(target)
  if (!https) {
    try {
      const res = await fetch(target, { headers, signal: AbortSignal.timeout(timeoutMs) })
      return { status: res.status, text: await res.text() }
    }
    catch {
      return null
    }
  }
  return new Promise((resolve) => {
    let settled = false
    const done = (value: PlainResponse | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const req = https.request(target, { method: 'GET', headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => { chunks.push(chunk as Buffer) })
      res.on('end', () => done({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', () => done(null))
    req.setTimeout(timeoutMs, () => { req.destroy(); done(null) })
    req.end()
  })
}

export async function plainGetBinary(url: string, options: PlainOptions = {}): Promise<PlainBinaryResponse | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const headers = {
    'user-agent': DEFAULT_UA,
    'accept': 'image/avif,image/webp,image/*,*/*',
    ...options.headers,
  }
  const https = await loadModule(url)
  if (!https) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
      return { status: res.status, contentType: res.headers.get('content-type') ?? 'application/octet-stream', bytes: new Uint8Array(await res.arrayBuffer()) }
    }
    catch {
      return null
    }
  }
  return new Promise((resolve) => {
    let settled = false
    const done = (value: PlainBinaryResponse | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const req = https.request(url, { method: 'GET', headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => { chunks.push(chunk as Buffer) })
      res.on('end', () => {
        const raw = res.headers['content-type']
        const contentType = Array.isArray(raw) ? raw[0] ?? 'application/octet-stream' : raw ?? 'application/octet-stream'
        done({ status: res.statusCode ?? 0, contentType, bytes: new Uint8Array(Buffer.concat(chunks)) })
      })
    })
    req.on('error', () => done(null))
    req.setTimeout(timeoutMs, () => { req.destroy(); done(null) })
    req.end()
  })
}

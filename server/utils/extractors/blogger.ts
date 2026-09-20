import { asHttpUrl, isPlaceholderStreamUrl, VIDEO_UA } from './hosts'

const RPC_ID = 'WcwnYd'

interface BloggerFormat {
  url?: string
  height?: number
}

interface BloggerStreamingData {
  streamingData?: { formats?: BloggerFormat[] }
}

export function isBlogger(url: string): boolean {
  const lower = url.toLowerCase()
  return lower.includes('blogger.com/video.g') || lower.includes('blogspot.com/video.g')
}

function chunkFromBatchexecute(text: string): string | null {
  const after = text.replace(/^\)\]\}'\s*/, '')
  const newline = after.indexOf('\n')
  if (newline === -1) return null
  const length = Number.parseInt(after.slice(0, newline), 10)
  if (!Number.isFinite(length)) return null
  const chunk = after.slice(newline + 1, newline + 1 + length)
  return chunk.match(/^([\s\S]*)\n\d+$/)?.[1] ?? chunk
}

function findStreamingData(value: unknown): BloggerStreamingData | null {
  if (typeof value === 'string') {
    if (!value.includes('streamingData')) return null
    try {
      return findStreamingData(JSON.parse(value))
    }
    catch {
      return null
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStreamingData(item)
      if (found) return found
    }
    return null
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record.streamingData && typeof record.streamingData === 'object') return value as BloggerStreamingData
    for (const item of Object.values(record)) {
      const found = findStreamingData(item)
      if (found) return found
    }
  }
  return null
}

function bestFormatUrl(data: BloggerStreamingData): string | null {
  const formats = [...(data.streamingData?.formats ?? [])].sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
  for (const format of formats) {
    const url = asHttpUrl(format.url)
    if (url && !isPlaceholderStreamUrl(url)) return url
  }
  return null
}

export async function extractBlogger(embedUrl: string, _html: string): Promise<string | null> {
  let token: string | null = null
  try {
    token = new URL(embedUrl).searchParams.get('token')
  }
  catch {
    return null
  }
  if (!token) return null

  try {
    const pageRes = await fetch(embedUrl, {
      headers: { 'User-Agent': VIDEO_UA, Accept: 'text/html,application/xhtml+xml,*/*' },
      signal: AbortSignal.timeout(8000),
    })
    if (!pageRes.ok) return null
    const page = await pageRes.text()
    const sessionId = page.split('FdrFJe":"')[1]?.split('"')[0]
    const blogId = page.split('cfb2h":"')[1]?.split('"')[0]
    if (!sessionId || !blogId) return null

    const params = new URLSearchParams({
      rpcids: RPC_ID,
      'source-path': '/video.g',
      'f.sid': sessionId,
      bl: blogId,
      hl: 'en-US',
      _reqid: String(Math.floor(Date.now() / 1000) % 86400),
      rt: 'c',
    })
    const body = `f.req=${encodeURIComponent(JSON.stringify([[[RPC_ID, JSON.stringify([token, '', 0]), null, 'generic']]]))}`
    const rpcRes = await fetch(`https://www.blogger.com/_/BloggerVideoPlayerUi/data/batchexecute?${params}`, {
      method: 'POST',
      headers: {
        'User-Agent': VIDEO_UA,
        Accept: '*/*',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'x-same-domain': '1',
        Referer: 'https://www.blogger.com/',
      },
      body,
      signal: AbortSignal.timeout(8000),
    })
    if (!rpcRes.ok) return null

    const chunk = chunkFromBatchexecute(await rpcRes.text())
    if (!chunk) return null
    const data = findStreamingData(JSON.parse(chunk))
    return data ? bestFormatUrl(data) : null
  }
  catch {
    return null
  }
}

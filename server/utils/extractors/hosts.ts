import { getSpoofHeaders } from '../spoof'

const HD_PATTERNS = [
  '/ondesu/new/hd/',
  '/desudesu/new/hd/',
  '/otakustream/new/',
  '/moedesu/new/hd/',
  '/otakuwatch',
  '/dstream/arcg',
]

export function isDesuStreamHd(url: string): boolean {
  return HD_PATTERNS.some((p) => url.includes(p))
}

export async function extractDesuStream(_iframeUrl: string, html: string): Promise<string | null> {
  const sourceMatch = html.match(/<source\s+[^>]*src="([^"]+)"/)
  if (sourceMatch?.[1]) return sourceMatch[1]
  const sourceSingle = html.match(/<source\s+[^>]*src='([^']+)'/)
  if (sourceSingle?.[1]) return sourceSingle[1]
  const playerjsDouble = html.match(/file:\s*"(https?:\/\/[^"]+)"/)
  if (playerjsDouble?.[1]) return playerjsDouble[1]
  const playerjsSingle = html.match(/file:\s*'([^']+)'/)
  if (playerjsSingle?.[1]) return playerjsSingle[1]
  return null
}

export function isDesuDrive(url: string): boolean {
  return url.includes('/desudrive/')
}

export async function extractDesuDrive(_iframeUrl: string, html: string): Promise<string | null> {
  const match = html.match(/otakudesu\('(\{[^']+\})'\)/)
  if (!match) return null
  try {
    const raw = match[1]
    if (!raw) return null
    const data = JSON.parse(raw)
    return data.file || null
  } catch {
    return null
  }
}

export function isFiledon(url: string): boolean {
  return url.toLowerCase().includes('filedon')
}

export async function extractFiledon(_iframeUrl: string, html: string): Promise<string | null> {
  const match = html.match(/data-page="([^"]+)"/)
  if (!match) return null
  try {
    const raw = match[1]
    if (!raw) return null
    const decoded = raw
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#039;/g, "'")
    const page = JSON.parse(decoded)
    const url = page?.props?.url
    return typeof url === 'string' && url.includes('r2.cloudflarestorage.com') ? url : null
  } catch {
    return null
  }
}

export function isMoeplay(url: string): boolean {
  return url.includes('/moeplay/') || url.includes('desustream.me')
}

function parseMoeplayHtml(html: string): string | null {
  const source = html.match(/<source\s+[^>]*src="([^"]+)"/)?.[1]
  if (source) return source
  const sourceSingle = html.match(/<source\s+[^>]*src='([^']+)'/)?.[1]
  if (sourceSingle) return sourceSingle
  const fileDouble = html.match(/file:\s*"(https?:\/\/[^"]+)"/)?.[1]
  if (fileDouble) return fileDouble
  const fileSingle = html.match(/file:\s*'([^']+)'/)?.[1]
  if (fileSingle) return fileSingle
  return html.match(/https?:\/\/[^\s"'<>]*googlevideo[^\s"'<>]*/)?.[0] ?? null
}

export async function extractMoeplay(_iframeUrl: string, html: string): Promise<string | null> {
  return parseMoeplayHtml(html)
}

function parseYouruploadHtml(html: string): string | null {
  const ogVideo = html.match(/og:video[^>]+content="([^"]+)"/)?.[1]
  if (ogVideo) return ogVideo
  const fileSingle = html.match(/file:\s*'([^']+)'/)?.[1]
  if (fileSingle) return fileSingle
  const fileDouble = html.match(/file:\s*"(https?:\/\/[^"]+)"/)?.[1]
  if (fileDouble) return fileDouble
  const source = html.match(/<source\s+[^>]*src="([^"]+)"/)?.[1]
  if (source) return source
  return html.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/)?.[0] ?? null
}

export function isYourupload(url: string): boolean {
  const lower = url.toLowerCase()
  return lower.includes('yourupload.com') || url.includes('vidcache.net')
}

export async function extractYourupload(_iframeUrl: string, html: string): Promise<string | null> {
  return parseYouruploadHtml(html)
}

export function isYuplod(url: string): boolean {
  return url.includes('yuplod')
}

async function fetchNestedHtml(url: string, referer: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: getSpoofHeaders(referer, 'iframe'),
      signal: AbortSignal.timeout(8000),
    })
    return await res.text()
  } catch {
    return ''
  }
}

function resolveNestedSrc(src: string, base: string): string | null {
  try {
    return new URL(src, base).toString()
  } catch {
    return null
  }
}

export async function extractYuplod(iframeUrl: string, html: string): Promise<string | null> {
  const nestedSrc = html.match(/<iframe[^>]+src="([^"]+)"/)?.[1]
  if (!nestedSrc) return parseYouruploadHtml(html)
  const nestedUrl = resolveNestedSrc(nestedSrc, iframeUrl)
  if (!nestedUrl) return null
  const nestedHtml = await fetchNestedHtml(nestedUrl, iframeUrl)
  if (!nestedHtml) return null
  return parseYouruploadHtml(nestedHtml)
}

export function upstreamRefererFor(url: string): string | null {
  if (url.includes('vidcache.net')) return 'https://www.yourupload.com/'
  return null
}

const VIDEO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export function upstreamHeadersFor(url: string, range?: string): Record<string, string> {
  let referer = upstreamRefererFor(url)
  if (!referer) {
    try {
      referer = `${new URL(url).origin}/`
    } catch {
      referer = 'https://otakudesu.blog/'
    }
  }
  const headers: Record<string, string> = {
    'User-Agent': VIDEO_UA,
    Referer: referer,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
  }
  if (range) headers.Range = range
  return headers
}

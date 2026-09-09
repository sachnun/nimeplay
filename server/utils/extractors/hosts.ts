import { getSpoofHeaders } from '../spoof'

export function asHttpUrl(value: string | null | undefined, base?: string): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) return null
  try {
    const resolved = base ? new URL(trimmed, base).toString() : trimmed
    const parsed = new URL(resolved)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

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

export async function extractDesuStream(embedUrl: string, html: string): Promise<string | null> {
  const sourceMatch = html.match(/<source\s+[^>]*src="([^"]+)"/)?.[1]
  const resolvedSource = asHttpUrl(sourceMatch, embedUrl)
  if (resolvedSource) return resolvedSource
  const sourceSingle = html.match(/<source\s+[^>]*src='([^']+)'/)?.[1]
  const resolvedSingle = asHttpUrl(sourceSingle, embedUrl)
  if (resolvedSingle) return resolvedSingle
  const playerjsDouble = html.match(/file:\s*"(https?:\/\/[^"]+)"/)?.[1]
  const resolvedDouble = asHttpUrl(playerjsDouble)
  if (resolvedDouble) return resolvedDouble
  const playerjsSingle = html.match(/file:\s*'([^']+)'/)?.[1]
  return asHttpUrl(playerjsSingle)
}

export function isDesuDrive(url: string): boolean {
  return url.includes('/desudrive/')
}

export async function extractDesuDrive(_embedUrl: string, html: string): Promise<string | null> {
  const match = html.match(/otakudesu\('(\{[^']+\})'\)/)
  if (!match) return null
  try {
    const raw = match[1]
    if (!raw) return null
    const data = JSON.parse(raw)
    return asHttpUrl(data.file)
  } catch {
    return null
  }
}

export function isFiledon(url: string): boolean {
  return url.toLowerCase().includes('filedon')
}

export async function extractFiledon(_embedUrl: string, html: string): Promise<string | null> {
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
    if (typeof url !== 'string' || !url.includes('r2.cloudflarestorage.com')) return null
    return asHttpUrl(url)
  } catch {
    return null
  }
}

export function isMoeplay(url: string): boolean {
  return url.includes('/moeplay/') || url.includes('desustream.me')
}

function parseMoeplayHtml(html: string, base?: string): string | null {
  const candidates = [
    html.match(/<source\s+[^>]*src="([^"]+)"/)?.[1],
    html.match(/<source\s+[^>]*src='([^']+)'/)?.[1],
    html.match(/file:\s*"(https?:\/\/[^"]+)"/)?.[1],
    html.match(/file:\s*'([^']+)'/)?.[1],
    html.match(/https?:\/\/[^\s"'<>]*googlevideo[^\s"'<>]*/)?.[0],
  ]
  for (const candidate of candidates) {
    const resolved = asHttpUrl(candidate, base)
    if (resolved) return resolved
  }
  return null
}

export async function extractMoeplay(embedUrl: string, html: string): Promise<string | null> {
  return parseMoeplayHtml(html, embedUrl)
}

function parseYouruploadHtml(html: string, base?: string): string | null {
  const candidates = [
    html.match(/og:video[^>]+content="([^"]+)"/)?.[1],
    html.match(/file:\s*'([^']+)'/)?.[1],
    html.match(/file:\s*"(https?:\/\/[^"]+)"/)?.[1],
    html.match(/<source\s+[^>]*src="([^"]+)"/)?.[1],
    html.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/)?.[0],
  ]
  for (const candidate of candidates) {
    const resolved = asHttpUrl(candidate, base)
    if (resolved) return resolved
  }
  return null
}

export function isYourupload(url: string): boolean {
  const lower = url.toLowerCase()
  return lower.includes('yourupload.com') || url.includes('vidcache.net')
}

export async function extractYourupload(embedUrl: string, html: string): Promise<string | null> {
  return parseYouruploadHtml(html, embedUrl)
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
  return asHttpUrl(src, base)
}

export async function extractYuplod(embedUrl: string, html: string): Promise<string | null> {
  const nestedMatch = html.match(/<iframe[^>]+src=(?:"([^"]+)"|'([^']+)')/)
  const nestedSrc = nestedMatch?.[1] ?? nestedMatch?.[2]
  if (!nestedSrc) return parseYouruploadHtml(html, embedUrl)
  const nestedUrl = resolveNestedSrc(nestedSrc, embedUrl)
  if (!nestedUrl) return parseYouruploadHtml(html, embedUrl)
  const nestedHtml = await fetchNestedHtml(nestedUrl, embedUrl)
  if (!nestedHtml) return null
  return parseYouruploadHtml(nestedHtml, nestedUrl)
}

export function isAnimeverse(url: string): boolean {
  return url.toLowerCase().includes('animeverse')
}

export async function extractAnimeverse(embedUrl: string, html: string): Promise<string | null> {
  return parseMoeplayHtml(html, embedUrl) ?? parseYouruploadHtml(html, embedUrl)
}

export function isPixeldrain(url: string): boolean {
  return url.toLowerCase().includes('pixeldrain')
}

function pixeldrainDirectUrl(embedUrl: string): string | null {
  const id = embedUrl.match(/pixeldrain\.com\/(?:u|api\/file)\/([A-Za-z0-9]+)/)?.[1]
  if (!id) return null
  return asHttpUrl(`https://pixeldrain.com/api/file/${id}`)
}

export async function extractPixeldrain(embedUrl: string, html: string): Promise<string | null> {
  const direct = pixeldrainDirectUrl(embedUrl)
  if (direct) return direct
  return parseMoeplayHtml(html, embedUrl) ?? parseYouruploadHtml(html, embedUrl)
}

export function upstreamRefererFor(url: string): string | null {
  if (url.includes('vidcache.net')) return 'https://www.yourupload.com/'
  if (url.toLowerCase().includes('nekoclouds.com')) return 'https://nekoclouds.com/'
  return null
}

const VIDEO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export function upstreamHeadersFor(url: string, range?: string): Record<string, string> {
  let referer = upstreamRefererFor(url)
  if (!referer) {
    const parsed = asHttpUrl(url)
    if (parsed) {
      try {
        referer = `${new URL(parsed).origin}/`
      } catch {
        referer = 'https://otakudesu.blog/'
      }
    } else {
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

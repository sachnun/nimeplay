import { getSpoofHeaders } from '../spoof'
import { isVidhide, extractVidhide } from './vidhide'
import { isDesuStreamHd, extractDesuStream } from './desustream'
import { isDesuDrive, extractDesuDrive } from './desudrive'
import { isFiledon, extractFiledon } from './filedon'

type HostExtractor = {
  matches: (url: string) => boolean
  extract: (url: string, html: string) => Promise<string | null> | string | null
}

const HOST_EXTRACTORS: HostExtractor[] = [
  { matches: isVidhide, extract: extractVidhide },
  { matches: isDesuStreamHd, extract: extractDesuStream },
  { matches: isDesuDrive, extract: extractDesuDrive },
  { matches: isFiledon, extract: extractFiledon },
]

async function fetchIframeHtml(iframeUrl: string): Promise<string> {
  try {
    const res = await fetch(iframeUrl, {
      headers: getSpoofHeaders(iframeUrl, 'iframe'),
      signal: AbortSignal.timeout(8000),
    })
    return await res.text()
  } catch {
    return ''
  }
}

async function extractKnownHost(iframeUrl: string, html: string): Promise<string | null> {
  const extractor = HOST_EXTRACTORS.find((c) => c.matches(iframeUrl))
  if (!extractor) return null
  try {
    return await extractor.extract(iframeUrl, html)
  } catch {
    return null
  }
}

async function extractFallbackHost(iframeUrl: string, html: string): Promise<string | null> {
  const mp4Url = html.match(/<source\s+src="([^"]*googlevideo[^"]*)"/)?.[1]
  const candidates = [
    () => extractVidhide(iframeUrl, html),
    ...(mp4Url ? [async () => mp4Url] : []),
    () => extractDesuDrive(iframeUrl, html),
  ]
  for (const candidate of candidates) {
    try {
      const value = await candidate()
      if (value) return value
    } catch {}
  }
  return null
}

export async function probeIframeUrl(iframeUrl: string): Promise<boolean> {
  return (await fetchIframeHtml(iframeUrl)).length > 100
}

export async function detectStreamKind(url: string): Promise<'hls' | 'file'> {
  if (/\.m3u8($|\?)/i.test(url)) return 'hls'
  try {
    const res = await fetch(url, {
      headers: { ...getSpoofHeaders(`${new URL(url).origin}/`, 'cors'), Range: 'bytes=0-15' },
      signal: AbortSignal.timeout(5000),
    })
    void res.body?.cancel()
    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('mpegurl')) return 'hls'
    const head = new Uint8Array(await res.arrayBuffer())
    let prefix = ''
    for (const byte of head) prefix += String.fromCharCode(byte)
    if (prefix.startsWith('#EXTM3U')) return 'hls'
  } catch {}
  return 'file'
}

export async function extractStreamUrl(iframeUrl: string): Promise<{ url: string | null; iframeUrl: string }> {
  if (/\.(m3u8|mp4|mkv|webm)(\?|$)/i.test(iframeUrl)) return { url: iframeUrl, iframeUrl }
  const html = await fetchIframeHtml(iframeUrl)
  const url = (await extractKnownHost(iframeUrl, html)) ?? (await extractFallbackHost(iframeUrl, html))
  return { url, iframeUrl }
}
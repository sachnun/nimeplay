import { getSpoofHeaders } from '../spoof'
import { isVidhide, extractVidhide } from './vidhide'
import { isDesuStreamHd, extractDesuStream, isDesuDrive, extractDesuDrive, isFiledon, extractFiledon } from './hosts'
import { isPuterin, extractPuterin } from './puterin'

type HostExtractor = {
  matches: (url: string) => boolean
  extract: (url: string, html: string) => Promise<string | null> | string | null
}

const HOST_EXTRACTORS: HostExtractor[] = [
  { matches: isVidhide, extract: extractVidhide },
  { matches: isDesuStreamHd, extract: extractDesuStream },
  { matches: isDesuDrive, extract: extractDesuDrive },
  { matches: isFiledon, extract: extractFiledon },
  { matches: isPuterin, extract: extractPuterin },
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
  if (mp4Url) return mp4Url
  try {
    return await extractDesuDrive(iframeUrl, html)
  }
  catch {
    return null
  }
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
  }
  catch {
  }
  return 'file'
}

export async function extractStreamUrl(iframeUrl: string): Promise<{ url: string | null; iframeUrl: string }> {
  if (/\.(m3u8|mp4|mkv|webm)(\?|$)/i.test(iframeUrl)) return { url: iframeUrl, iframeUrl }
  const html = await fetchIframeHtml(iframeUrl)
  const url = (await extractKnownHost(iframeUrl, html)) ?? (await extractFallbackHost(iframeUrl, html))
  return { url, iframeUrl }
}
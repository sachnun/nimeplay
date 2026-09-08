import { getSpoofHeaders } from '../spoof'
import { isVidhide, extractVidhide } from './vidhide'
import { asHttpUrl, isAnimeverse, extractAnimeverse, isDesuStreamHd, extractDesuStream, isDesuDrive, extractDesuDrive, isFiledon, extractFiledon, isMoeplay, extractMoeplay, isPixeldrain, extractPixeldrain, isYuplod, extractYuplod, isYourupload, extractYourupload, upstreamHeadersFor } from './hosts'

type HostExtractor = {
  matches: (url: string) => boolean
  extract: (url: string, html: string) => Promise<string | null> | string | null
}

const HOST_EXTRACTORS: HostExtractor[] = [
  { matches: isVidhide, extract: extractVidhide },
  { matches: isAnimeverse, extract: extractAnimeverse },
  { matches: isPixeldrain, extract: extractPixeldrain },
  { matches: isDesuStreamHd, extract: extractDesuStream },
  { matches: isDesuDrive, extract: extractDesuDrive },
  { matches: isMoeplay, extract: extractMoeplay },
  { matches: isYuplod, extract: extractYuplod },
  { matches: isYourupload, extract: extractYourupload },
  { matches: isFiledon, extract: extractFiledon },
]

async function fetchEmbedHtml(embedUrl: string): Promise<string> {
  try {
    const res = await fetch(embedUrl, {
      headers: getSpoofHeaders(embedUrl, 'iframe'),
      signal: AbortSignal.timeout(8000),
    })
    return await res.text()
  } catch {
    return ''
  }
}

async function extractKnownHost(embedUrl: string, html: string): Promise<string | null> {
  const extractor = HOST_EXTRACTORS.find((c) => c.matches(embedUrl))
  if (!extractor) return null
  try {
    return await extractor.extract(embedUrl, html)
  } catch {
    return null
  }
}

async function extractFallbackHost(embedUrl: string, html: string): Promise<string | null> {
  const mp4Url = asHttpUrl(html.match(/<source\s+[^>]*src="([^"]*googlevideo[^"]*)"/)?.[1], embedUrl)
  if (mp4Url) return mp4Url
  const ogVideo = asHttpUrl(html.match(/og:video[^>]+content="([^"]+)"/)?.[1], embedUrl)
  if (ogVideo) return ogVideo
  const jwFile = asHttpUrl(html.match(/file:\s*'([^']+)'/)?.[1], embedUrl)
  if (jwFile) return jwFile
  try {
    return await extractDesuDrive(embedUrl, html)
  }
  catch {
    return null
  }
}

export async function detectStreamKind(url: string): Promise<'hls' | 'file'> {
  if (/\.m3u8($|\?)/i.test(url)) return 'hls'
  try {
    const res = await fetch(url, {
      headers: upstreamHeadersFor(url, 'bytes=0-15'),
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

export async function extractStreamUrl(embedUrl: string): Promise<string | null> {
  if (/\.(m3u8|mp4|mkv|webm)(\?|$)/i.test(embedUrl)) return asHttpUrl(embedUrl)
  const html = await fetchEmbedHtml(embedUrl)
  if (!html) return null
  const direct = (await extractKnownHost(embedUrl, html)) ?? (await extractFallbackHost(embedUrl, html))
  return asHttpUrl(direct)
}

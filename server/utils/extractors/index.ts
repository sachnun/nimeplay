import { isNekoclouds, extractNekoclouds } from './nekoclouds'
import { isOdcloud, extractOdcloud } from './odcloud'
import { isVidhide, extractVidhide } from './vidhide'
import { asHttpUrl, isPlaceholderStreamUrl, isAnimeverse, extractAnimeverse, isDesuStreamHd, extractDesuStream, isDesuDrive, extractDesuDrive, isFiledon, extractFiledon, isMoeplay, extractMoeplay, isPixeldrain, extractPixeldrain, isYuplod, extractYuplod, isYourupload, extractYourupload, embedPageHeadersFor, upstreamHeadersFor } from './hosts'
import { isPuterin, extractPuterin } from './puterin'
import { isBlogger, extractBlogger } from './blogger'

type HostExtractor = {
  matches: (url: string) => boolean
  extract: (url: string, html: string) => Promise<string | null> | string | null
}

const HOST_EXTRACTORS: HostExtractor[] = [
  { matches: isNekoclouds, extract: extractNekoclouds },
  { matches: isOdcloud, extract: extractOdcloud },
  { matches: isVidhide, extract: extractVidhide },
  { matches: isAnimeverse, extract: extractAnimeverse },
  { matches: isPixeldrain, extract: extractPixeldrain },
  { matches: isDesuStreamHd, extract: extractDesuStream },
  { matches: isDesuDrive, extract: extractDesuDrive },
  { matches: isMoeplay, extract: extractMoeplay },
  { matches: isYuplod, extract: extractYuplod },
  { matches: isYourupload, extract: extractYourupload },
  { matches: isFiledon, extract: extractFiledon },
  { matches: isPuterin, extract: extractPuterin },
  { matches: isBlogger, extract: extractBlogger },
]

async function fetchEmbedHtml(embedUrl: string): Promise<string> {
  try {
    const res = await fetch(embedUrl, {
      headers: embedPageHeadersFor(embedUrl),
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
  if (mp4Url && !isPlaceholderStreamUrl(mp4Url)) return mp4Url
  const ogVideo = asHttpUrl(html.match(/og:video[^>]+content="([^"]+)"/)?.[1], embedUrl)
  if (ogVideo && !isPlaceholderStreamUrl(ogVideo)) return ogVideo
  const jwFile = asHttpUrl(html.match(/file:\s*'([^']+)'/)?.[1], embedUrl)
  if (jwFile && !isPlaceholderStreamUrl(jwFile)) return jwFile
  const jwFileDouble = asHttpUrl(html.match(/file:\s*"([^"]+)"/)?.[1], embedUrl)
  if (jwFileDouble && !isPlaceholderStreamUrl(jwFileDouble)) return jwFileDouble
  try {
    return await extractDesuDrive(embedUrl, html)
  }
  catch {
    return null
  }
}

export async function probeStream(url: string, headers?: Record<string, string>): Promise<{ kind: 'hls' | 'file', ok: boolean }> {
  const playlist = /\.m3u8($|\?)/i.test(url)
  const request = { ...upstreamHeadersFor(url, playlist ? undefined : 'bytes=0-15'), ...headers }
  for (const [key, value] of Object.entries(request)) {
    if (value === '') delete request[key]
  }
  try {
    const res = await fetch(url, {
      headers: request,
      signal: AbortSignal.timeout(5000),
    })
    void res.body?.cancel()
    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    return { kind: playlist || contentType.includes('mpegurl') ? 'hls' : 'file', ok: res.ok || res.status === 206 }
  }
  catch {
    return { kind: playlist ? 'hls' : 'file', ok: false }
  }
}

export async function extractStreamUrl(embedUrl: string): Promise<string | null> {
  if (isPlaceholderStreamUrl(embedUrl)) return null
  if (/\.(m3u8|mp4|mkv|webm)(\?|$)/i.test(embedUrl)) {
    const direct = asHttpUrl(embedUrl)
    if (!direct || isPlaceholderStreamUrl(direct)) return null
    return direct
  }
  const html = await fetchEmbedHtml(embedUrl)
  if (!html) return null
  const direct = (await extractKnownHost(embedUrl, html)) ?? (await extractFallbackHost(embedUrl, html))
  if (!direct || isPlaceholderStreamUrl(direct)) return null
  return asHttpUrl(direct)
}

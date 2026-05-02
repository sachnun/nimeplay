import { getSpoofHeaders } from '../spoof'
import { timeoutSignal } from '../fetch'
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

async function fetchIframeHTML(iframeUrl: string): Promise<string> {
  const res = await fetch(iframeUrl, {
    headers: getSpoofHeaders(iframeUrl, 'iframe'),
    signal: timeoutSignal(8000),
  })
  return res.text()
}

export async function probeIframeUrl(iframeUrl: string): Promise<boolean> {
  try {
    const res = await fetch(iframeUrl, {
      headers: getSpoofHeaders(iframeUrl, 'iframe'),
      signal: timeoutSignal(5000),
    })
    const body = await res.text()
    return body.length > 100
  } catch {
    return false
  }
}

async function extractKnownHost(iframeUrl: string, html: string): Promise<string | null> {
  const extractor = HOST_EXTRACTORS.find((candidate) => candidate.matches(iframeUrl))
  return extractor ? extractor.extract(iframeUrl, html) : null
}

async function extractFallbackHost(iframeUrl: string, html: string): Promise<string | null> {
  const vidhideUrl = await extractVidhide(iframeUrl, html)
  if (vidhideUrl) return vidhideUrl
  const mp4Match = html.match(/<source\s+src="([^"]*googlevideo[^"]*)"/)
  if (mp4Match?.[1]) return mp4Match[1]
  return extractDesuDrive(iframeUrl, html)
}

export async function extractStreamUrl(iframeUrl: string): Promise<{ proxiedUrl: string | null; iframeUrl: string }> {
  try {
    const html = await fetchIframeHTML(iframeUrl)
    if (!html) return { proxiedUrl: null, iframeUrl }
    const proxiedUrl = await extractKnownHost(iframeUrl, html) ?? await extractFallbackHost(iframeUrl, html)
    return { proxiedUrl, iframeUrl }
  } catch {
    return { proxiedUrl: null, iframeUrl }
  }
}
